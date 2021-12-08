import http, {IncomingMessage, ServerResponse } from 'http';
import { createServer } from 'https';
import { readFileSync } from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import portscanner from 'portscanner';

const args = process.argv.slice(2);

async function run() {
    let startingPort = 3005;

    // If client pass --randomPort as parameter then it will choose a random port
    if (args.includes('--randomPort')) {
        startingPort = Math.floor(Math.random() * (3999 - 3005 + 1)) + 3005;
    }

    const wssPort = await portscanner.findAPortNotInUse(
        startingPort,
        startingPort + 1000
    );

    let wss: WebSocketServer;

    const keyPath = args.find(arg => arg.startsWith('--key='))?.match(/--key=(\S+)/)?.[1];
    const certPath = args.find(arg => arg.startsWith('--cert='))?.match(/--cert=(\S+)/)?.[1];
    if (keyPath && certPath) {
        const httpsServer = createServer({
            key: readFileSync(keyPath),
            cert: readFileSync(certPath)
        });
        httpsServer.listen(wssPort);

        wss = new WebSocketServer({ server: httpsServer });

        clientsListener(wss);
        console.log(`WebSocket server started wss://localhost:${wssPort}`);
    } else {
        wss = new WebSocketServer({ port: wssPort });

        clientsListener(wss);
        console.log(`WebSocket server started ws://localhost:${wssPort}`);
    }

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

function clientsListener(wss: WebSocketServer) {
    wss.on('connection', function connection(ws) {
        console.log(`Client connected at: ${Date.now()}`);
        ws.on('message', function incoming(message) {
            console.log('Message received from client: ', message);
        });
    });
}

function broadcast(wss: WebSocketServer, message: string) {
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
