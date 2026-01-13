const https = require('https');
const crypto = require('crypto');

module.exports = async function (context, req) {
    context.log('Search function triggered');
    
    const accessionNumber = req.query.accessionNumber;
    
    if (!accessionNumber) {
        context.res = {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: "Please provide an accessionNumber parameter" })
        };
        return;
    }

    try {
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        const containerName = process.env.AZURE_CONTAINER_NAME || "documents";
        
        if (!connectionString) {
            context.res = {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: "Storage connection not configured" })
            };
            return;
        }

        // Parse connection string
        const parts = {};
        connectionString.split(';').forEach(part => {
            const [key, ...valueParts] = part.split('=');
            if (key && valueParts.length > 0) {
                parts[key] = valueParts.join('=');
            }
        });
        
        const accountName = parts['AccountName'];
        const accountKey = parts['AccountKey'];
        
        // List all blobs with prefix search
        const blobs = await listBlobs(accountName, accountKey, containerName, accessionNumber);
        
        const results = blobs.map(blob => ({
            name: blob.name,
            url: `https://${accountName}.blob.core.windows.net/${containerName}/${encodeURIComponent(blob.name)}`,
            size: blob.contentLength,
            lastModified: blob.lastModified,
            contentType: blob.contentType
        }));

        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                count: results.length,
                accessionNumber: accessionNumber,
                results: results
            })
        };
    } catch (error) {
        context.log.error('Search error:', error);
        context.res = {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                error: `Search failed: ${error.message}`
            })
        };
    }
};

async function listBlobs(accountName, accountKey, containerName, searchTerm) {
    const allBlobs = [];
    let marker = '';
    
    do {
        const result = await listBlobsPage(accountName, accountKey, containerName, marker);
        
        // Filter blobs that contain the search term
        const matchingBlobs = result.blobs.filter(blob => 
            blob.name.includes(searchTerm)
        );
        allBlobs.push(...matchingBlobs);
        
        marker = result.nextMarker;
    } while (marker);
    
    return allBlobs;
}

async function listBlobsPage(accountName, accountKey, containerName, marker) {
    const date = new Date().toUTCString();
    const version = '2020-10-02';
    
    // Build query string and canonicalized resource
    let queryString = `restype=container&comp=list&maxresults=1000`;
    let canonicalizedResource = `/${accountName}/${containerName}\ncomp:list\nmaxresults:1000`;
    
    if (marker) {
        queryString += `&marker=${encodeURIComponent(marker)}`;
        canonicalizedResource = `/${accountName}/${containerName}\ncomp:list\nmarker:${marker}\nmaxresults:1000`;
    }
    
    canonicalizedResource += `\nrestype:container`;
    
    const stringToSign = `GET\n\n\n\n\n\n\n\n\n\n\n\nx-ms
