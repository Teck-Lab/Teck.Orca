using Npgsql;
using NSubstitute;
using Testcontainers.PostgreSql;
using Xunit;

public interface IStock
{
    int Available(string sku);
}

public sealed class StockPolicy(IStock stock)
{
    public bool CanReserve(string sku, int quantity) =>
        quantity > 0 && stock.Available(sku) >= quantity;
}

public sealed class UnitTests
{
    [Theory]
    [InlineData(0, false)]
    [InlineData(3, true)]
    [InlineData(4, false)]
    public void ReservationRespectsQuantityAndStock(int quantity, bool expected)
    {
        var stock = Substitute.For<IStock>();
        stock.Available("item").Returns(3);

        Assert.Equal(expected, new StockPolicy(stock).CanReserve("item", quantity));
    }
}

public sealed class PostgresFixture : IAsyncLifetime
{
    public PostgreSqlContainer Database { get; } = new PostgreSqlBuilder("postgres:17.6-alpine")
        .WithLabel("teck.orca.testing-smoke", Environment.GetEnvironmentVariable("TECK_SMOKE_RUN_ID")
            ?? throw new InvalidOperationException("A smoke run identity is required"))
        .Build();

    public async ValueTask InitializeAsync()
    {
        try
        {
            await Database.StartAsync(TestContext.Current.CancellationToken);
        }
        catch
        {
            await Database.DisposeAsync();
            throw;
        }
    }

    public async ValueTask DisposeAsync() => await Database.DisposeAsync();
}

public sealed class IntegrationTests(PostgresFixture fixture) : IClassFixture<PostgresFixture>
{
    [Fact]
    public async Task PostgreSqlRoundTripAndRollback()
    {
        var cancellation = TestContext.Current.CancellationToken;
        // The generated connection string exercises the randomly mapped host
        // port from the agent's .NET process into nested Docker.
        await using var connection = new NpgsqlConnection(fixture.Database.GetConnectionString());
        await connection.OpenAsync(cancellation);
        await using var transaction = await connection.BeginTransactionAsync(cancellation);
        await using (var write = new NpgsqlCommand(
            "CREATE TABLE smoke (answer integer NOT NULL); INSERT INTO smoke VALUES (42);",
            connection, transaction))
        {
            await write.ExecuteNonQueryAsync(cancellation);
        }
        await using (var query = new NpgsqlCommand("SELECT answer FROM smoke", connection, transaction))
        {
            Assert.Equal(42, (int)(await query.ExecuteScalarAsync(cancellation))!);
        }
        await transaction.RollbackAsync(cancellation);
        await using var check = new NpgsqlCommand("SELECT to_regclass('public.smoke') IS NULL", connection);
        Assert.True((bool)(await check.ExecuteScalarAsync(cancellation))!);

        // The second phase fails after database work to verify fixture cleanup.
        Assert.NotEqual("1", Environment.GetEnvironmentVariable("TECK_SMOKE_FORCE_FAILURE"));
    }
}
