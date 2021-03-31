import http, { IncomingMessage, ServerResponse } from 'http';
import WebSocket, { Server } from 'ws';
import portscanner from 'portscanner';

async function run() {
    let startingPort = 3005;

    // If client pass --randomPort as parameter then it will choose a random port
    if (process.argv.slice(2).includes('--randomPort')) {
        startingPort = Math.floor(Math.random() * (3999 - 3005 + 1)) + 3005;
    }

    const wssPort = await portscanner.findAPortNotInUse(
        startingPort,
        startingPort + 1000
    );

    const wss = new WebSocket.Server({ port: wssPort });
    clientsListener(wss);
    console.log(`WebSocket server started ws://localhost:${wssPort}`);

    const server = http.createServer(
        async (request: IncomingMessage, response: ServerResponse) => {
            const headers = {
                'Content-Type': 'text plain',
            };

            if (request.method === 'OPTIONS') {
                response.writeHead(204, {
                    'Access-Control-Allow-Headers': '*',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                });
                response.end();
            } else if (request.method === 'POST') {
                broadcast(wss, await collectRequestData(request));
                response.writeHead(200, headers);
                response.end('Payload has been transmitted');
            } else {
                response.writeHead(405, headers);
                response.end('Method not allowed. Use POST method to broadcast your message.');
            }
        }
    );

    const httpPort = await portscanner.findAPortNotInUse(
        startingPort,
        startingPort + 1000
    );

    server.listen(httpPort);
    console.log(`HTPP proxy server started http://localhost:${httpPort}`);

    process.on('SIGINT', () => {
        wss.close();
        process.exit(0);
    });
}

function clientsListener(wss: Server) {
    wss.on('connection', function connection(ws) {
        console.log(`Client connected at: ${Date.now()}`);
        ws.on('message', function incoming(message) {
            console.log('Message received from client: ', message);
        });
    });
}

function broadcast(wss: Server, message: string) {
    if (!wss.clients?.size) {
        console.log('No active clients');
        return;
    }

    console.log(
        `Broadcasting message to  ${wss.clients.size} clients: ${JSON.stringify(
            message
        )}`
    );
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function collectRequestData(request: IncomingMessage): Promise<string> {
    let resolve: (body: string) => void;

    const promise = new Promise<string>((_resolve) => {
        resolve = _resolve;
    });
    let body = '';
    request.on('data', (chunk) => {
        body += chunk.toString();
    });
    request.on('end', () => {
        resolve(body);
    });

    return promise;
}

run();
