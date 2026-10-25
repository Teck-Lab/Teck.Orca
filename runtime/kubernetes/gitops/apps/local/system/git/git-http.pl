#!/usr/bin/perl
use strict;
use warnings;
use IO::Socket::INET;
use File::Temp qw(tempfile);

# Private local development service only. No shell, arbitrary repositories,
# external URL forwarding or user credentials. Writes stay in two local repos.
my $server = IO::Socket::INET->new(LocalAddr => '0.0.0.0', LocalPort => 8080,
    Listen => 32, ReuseAddr => 1) or die "Cannot listen for local Git\n";
$SIG{CHLD} = 'IGNORE';
while (my $client = $server->accept()) {
    my $pid = fork();
    if (!defined $pid) { close $client; next; }
    if ($pid) { close $client; next; }
    close $server;
    $SIG{CHLD} = 'DEFAULT';
    eval { alarm 120; serve($client); };
    close $client;
    exit 0;
}
sub fail {
    my ($client, $status) = @_;
    print $client "HTTP/1.1 $status\r\nConnection: close\r\nContent-Length: 0\r\n\r\n";
    die "Request refused\n";
}
sub exact {
    my ($client, $length, $out) = @_;
    my $remaining = $length;
    while ($remaining > 0) {
        my $read = read($client, my $buffer, $remaining > 65536 ? 65536 : $remaining);
        die "Incomplete request\n" unless $read;
        print $out $buffer if $out;
        $remaining -= $read;
    }
}
sub serve {
    my ($client) = @_;
    $client->autoflush(1);
    my $request = <$client> // die "Empty request\n";
    fail($client, '400 Bad Request') unless length($request) < 8192 &&
        $request =~ /^(GET|POST) (\S+) HTTP\/1\.[01]\r?\n$/;
    my ($method, $target) = ($1, $2);
    my %headers; my $header_bytes = 0;
    while (my $line = <$client>) {
        $header_bytes += length($line);
        fail($client, '431 Request Header Fields Too Large') if $header_bytes > 32768;
        last if $line =~ /^\r?\n$/;
        fail($client, '400 Bad Request') unless $line =~ /^([A-Za-z0-9-]+):\s*([^\r\n]*)\r?\n$/;
        my ($key, $value) = (lc($1), $2);
        fail($client, '400 Bad Request') if exists $headers{$key};
        $headers{$key} = $value;
    }
    if ($method eq 'GET' && $target eq '/healthz') {
        print $client "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK"; return;
    }
    my ($path, $query) = split /\?/, $target, 2;
    fail($client, '404 Not Found') unless $path =~ m{^/(apps|gitops)\.git/(?:info/refs|git-upload-pack|git-receive-pack)$};
    fail($client, '400 Bad Request') if defined($query) && $query !~ /^service=git-(?:upload|receive)-pack$/;
    my ($body, $filename) = tempfile(UNLINK => 1);
    binmode $body;
    my $length = 0;
    if (exists $headers{'transfer-encoding'}) {
        fail($client, '400 Bad Request') if exists $headers{'content-length'} || lc($headers{'transfer-encoding'}) ne 'chunked';
        while (1) {
            my $line = <$client> // die "Incomplete chunk\n";
            fail($client, '400 Bad Request') unless $line =~ /^([0-9a-fA-F]{1,8})\r?\n$/;
            my $size = hex($1); last unless $size;
            $length += $size; fail($client, '413 Content Too Large') if $length > 64 * 1024 * 1024;
            exact($client, $size, $body);
            fail($client, '400 Bad Request') unless (<$client> // '') =~ /^\r?\n$/;
        }
        fail($client, '400 Bad Request') unless (<$client> // '') =~ /^\r?\n$/;
    } else {
        my $value = $headers{'content-length'} // '0';
        fail($client, '400 Bad Request') unless $value =~ /^\d{1,9}$/;
        $length = int($value); fail($client, '413 Content Too Large') if $length > 64 * 1024 * 1024;
        exact($client, $length, $body);
    }
    seek($body, 0, 0);
    my ($errors) = tempfile(UNLINK => 1);
    local %ENV = (PATH => '/usr/bin:/bin', HOME => '/tmp',
        GIT_CONFIG_GLOBAL => '/dev/null', GIT_CONFIG_SYSTEM => '/dev/null',
        GIT_PROJECT_ROOT => '/repos', GIT_HTTP_EXPORT_ALL => '1',
        REQUEST_METHOD => $method, PATH_INFO => $path, QUERY_STRING => $query // '',
        CONTENT_TYPE => $headers{'content-type'} // '', CONTENT_LENGTH => "$length",
        HTTP_CONTENT_ENCODING => $headers{'content-encoding'} // '',
        HTTP_GIT_PROTOCOL => $headers{'git-protocol'} // '',
        GIT_PROTOCOL => $headers{'git-protocol'} // '');
    my $pid = open(my $output, '-|');
    die "Cannot start Git backend\n" unless defined $pid;
    if (!$pid) {
        open(STDIN, '<&', $body) or die "Cannot attach request\n";
        open(STDERR, '>&', $errors) or die "Cannot attach diagnostic stream\n";
        exec '/usr/lib/git-core/git-http-backend';
        die "Git backend unavailable\n";
    }
    my $status = '200 OK'; my @response_headers;
    while (my $line = <$output>) {
        last if $line =~ /^\r?\n$/;
        $line =~ s/\r?\n$//;
        if ($line =~ /^Status:\s*(\d{3}[^\r\n]*)$/i) { $status = $1; }
        elsif ($line =~ /^[A-Za-z0-9-]+:[^\r\n]*$/) { push @response_headers, $line; }
    }
    print $client "HTTP/1.1 $status\r\n", join("\r\n", @response_headers), "\r\nConnection: close\r\n\r\n";
    while (read($output, my $buffer, 65536)) { print $client $buffer; }
    close $output;
    seek($errors, 0, 0);
    while (my $line = <$errors>) { warn "local-git backend: $line"; }
}
