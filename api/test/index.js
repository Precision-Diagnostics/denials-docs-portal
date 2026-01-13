const https = require('https');
const crypto = require('crypto');

module.exports = async function (context, req) {
    try {
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        const containerName = process.env.AZURE_CONTAINER_NAME || "documents";
        
        const config = parseConnectionString(connectionString);
        
        context.log('Account:', config.accountName);
        context.log('Container:', containerName);
        
        const blobs = await listBlobs(config.accountName, config.accountKey, containerName);
        
        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                accountName: config.accountName,
                containerName: containerName,
                blobCount: blobs.length,
                firstFiveBlobs: blobs.slice(0, 5).map(b => b.name)
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

function parseConnectionString(connectionString) {
    const parts = {};
    connectionString.split(';').forEach(part => {
        const [key, ...valueParts] = part.split('=');
        if (key && valueParts.length > 0) {
            parts[key] = valueParts.join('=');
        }
    });
    return {
        accountName: parts['AccountName'],
        accountKey: parts['AccountKey']
    };
}

async function listBlobs(accountName, accountKey, containerName) {
    const date = new Date().toUTCString();
    const version = '2020-10-02';
    
    const stringToSign = `GET\n\n\n\n\n\n\n\n\n\n\n\nx-ms-date:${date}\nx-ms-version:${version}\n/${accountName}/${containerName}\ncomp:list\nrestype:container`;
    
    const signature = createHmacSignature(accountKey, stringToSign);
    
    const options = {
        hostname: `${accountName}.blob.core.windows.net`,
        path: `/${containerName}?restype=container&comp=list`,
        method: 'GET',
        headers: {
            'x-ms-date': date,
            'x-ms-version': version,
            'Authorization': `SharedKey ${accountName}:${signature}`
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.re
