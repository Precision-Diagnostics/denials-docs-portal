module.exports = async function (context, req) {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.AZURE_CONTAINER_NAME;
    
    context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: "Test endpoint working",
            hasConnectionString: !!connectionString,
            connectionStringLength: connectionString ? connectionString.length : 0,
            containerName: containerName || "not set",
            nodeVersion: process.version
        })
    };
};
