module.exports = async function (context, req) {
    try {
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        
        const parts = {};
        connectionString.split(';').forEach(part => {
            const [key, ...valueParts] = part.split('=');
            if (key && valueParts.length > 0) {
                parts[key] = valueParts.join('=');
            }
        });
        
        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                accountName: parts['AccountName'],
                hasAccountKey: !!parts['AccountKey'],
                accountKeyLength: parts['AccountKey'] ? parts['AccountKey'].length : 0,
                endpointSuffix: parts['EndpointSuffix'] || 'core.windows.net'
            })
        };
    } catch (error) {
        context.res = {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: error.message,
                stack: error.stack
            })
        };
    }
};
