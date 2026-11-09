using Testcontainers.K3s;

// Plugin acceptance fixture only. No kmsg mount, custom entrypoint or mknod:
// the unmodified module must inherit the device from the sandbox Docker host.
var image = Environment.GetEnvironmentVariable("TECK_K3S_IMAGE")
    ?? throw new InvalidOperationException("Set the explicit K3s image under test");
using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(8));
await using var cluster = new K3sBuilder(image).Build();
try
{
    await cluster.StartAsync(timeout.Token);
    async Task<string> Run(params string[] command)
    {
        var result = await cluster.ExecAsync(command, timeout.Token);
        if (result.ExitCode != 0)
            throw new InvalidOperationException($"{string.Join(' ', command)}: {result.Stderr}\n{result.Stdout}");
        return result.Stdout;
    }
    await Run("test", "-c", "/dev/kmsg");
    await Run("kubectl", "wait", "nodes", "--all", "--for=condition=Ready", "--timeout=120s");
    // Import a local image to exercise scheduling/CNI/runtime independently of
    // external registry proxy configuration inside the nested node.
    await cluster.CopyAsync(await File.ReadAllBytesAsync("/tmp/teck-k3s-pod-image.tar", timeout.Token), "/tmp/probe-image.tar", ct: timeout.Token);
    await Run("ctr", "images", "import", "/tmp/probe-image.tar");
    var probeImage = Environment.GetEnvironmentVariable("TECK_K3S_POD_IMAGE")
        ?? throw new InvalidOperationException("Set the pod image under test");
    await Run("kubectl", "run", "plugin-k3s-probe", "--image=" + probeImage,
        "--image-pull-policy=Never", "--restart=Never", "--command", "--", "sh", "-c", "echo plugin-k3s-pod-ok");
    await Run("kubectl", "wait", "pod/plugin-k3s-probe", "--for=jsonpath={.status.phase}=Succeeded", "--timeout=120s");
    var output = await Run("kubectl", "logs", "plugin-k3s-probe");
    if (output.Trim() != "plugin-k3s-pod-ok") throw new InvalidOperationException("Unexpected pod output");
    // Recheck the API after scheduling, rather than relying on a startup log.
    await Run("kubectl", "get", "--raw=/readyz");
    Console.WriteLine("PASS: unmodified K3s Testcontainers module, kmsg, Ready node, completed pod and healthy API");
}
catch
{
    if (cluster.Id is { Length: > 0 })
    {
        var logs = await cluster.GetLogsAsync();
        Console.Error.WriteLine(string.Join('\n', (logs.Stdout + logs.Stderr).Split('\n').TakeLast(20)));
        try
        {
            var events = await cluster.ExecAsync(["kubectl", "get", "events", "-A", "--sort-by=.lastTimestamp"]);
            Console.Error.WriteLine(string.Join('\n', (events.Stdout + events.Stderr).Split('\n').TakeLast(25)));
        }
        catch (Exception error) { Console.Error.WriteLine(error.Message); }
    }
    throw;
}
