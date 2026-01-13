const crypto = require('crypto');
global.crypto = crypto;

const { BlobServiceClient } = require("@azure/storage-blob");

module.exports = async function (context, req) {
    context.log('Search function triggered');
    
    const accessionNumber = req.query.accessionNumber;
    
    context.log('Accession number:', accessionNumber);
    
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
        
        context.log('Container name:', containerName);
        context.log('Connection string exists:', !!connectionString);
        context.log('Connection string length:', connectionString ? connectionString.length : 0);
        
        if (!connectionString) {
            context.res = {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: "Storage connection not configured" })
            };
            return;
        }
        
        context.log('Creating BlobServiceClient...');
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        
        context.log('Getting container client...');
        const containerClient = blobServiceClient.getContainerClient(containerName);
        
        context.log('Checking if container exists...');
        const exists = await containerClient.exists();
        context.log('Container exists:', exists);
        
        if (!exists) {
            context.res = {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: `Container '${containerName}' not found` })
            };
            return;
        }
        
        context.log('Starting blob search...');
        const results = [];
        let blobCount = 0;
        
        for await (const blob of containerClient.listBlobsFlat()) {
            blobCount++;
            if (blob.name.includes(accessionNumber)) {
                const blobClient = containerClient.getBlobClient(blob.name);
                results.push({
                    name: blob.name,
                    url: blobClient.url,
                    size: blob.properties.contentLength,
                    lastModified: blob.properties.lastModified,
                    contentType: blob.properties.contentType
                });
            }
        }
        
        context.log('Total blobs scanned:', blobCount);
        context.log('Matching results:', results.length);
        
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
        context.log.error('Search error:', error.message);
        context.log.error('Error stack:', error.stack);
        context.res = {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                error: `Search failed: ${error.message}`,
                details: error.toString()
            })
        };
    }
};
