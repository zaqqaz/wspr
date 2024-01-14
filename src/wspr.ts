import http, { IncomingMessage, ServerResponse } from 'http';
import { createServer } from 'https';
import { readFileSync } from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import portscanner from 'portscanner';
import url from 'url';
import querystring from 'querystring';

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

    const keyPath = args
        .find((arg) => arg.startsWith('--key='))
        ?.match(/--key=(\S+)/)?.[1];
    const certPath = args
        .find((arg) => arg.startsWith('--cert='))
        ?.match(/--cert=(\S+)/)?.[1];
    if (keyPath && certPath) {
        const httpsServer = createServer({
            key: readFileSync(keyPath),
            cert: readFileSync(certPath),
        });
        httpsServer.listen(wssPort);

        wss = new WebSocketServer({ server: httpsServer });
        console.log(`WebSocket server started wss://localhost:${wssPort}`);
    } else {
        wss = new WebSocketServer({ port: wssPort });

        clientsListener(wss);
        console.log(`WebSocket server started ws://localhost:${wssPort}`);
    }
    clientsListener(wss);

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
                response.end(
                    'Method not allowed. Use POST method to broadcast your message.'
                );
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
    wss.on('connection', function connection(ws,   request) {
        const proxyWsUrl = args
            .find((arg) => arg.startsWith('--proxyWsUrl='))
            ?.match(/--proxyWsUrl=(\S+)/)?.[1];

        const notifyProxyServer: ((message: string) => void)[] = [];

        setTimeout(() => {
            console.log('Query parameters after delay:', request.url);
        }, 100);

        if(proxyWsUrl) {
            console.log('Connecting to proxy server')
            // Append query parameters to the proxy WebSocket URL
            const queryParameters = url.parse(request.url || 'http://localhost', true).query;

            // Append query parameters to the proxy WebSocket URL
            const queryString = querystring.stringify(queryParameters);
            const proxyWsUrlWithParams = proxyWsUrl + (queryString ? `?${queryString}` : '');
            const proxyWs = new WebSocket(proxyWsUrlWithParams);

            proxyWs.on('open', () => {
                console.log(`Proxy WebSocket connection established with ${proxyWsUrlWithParams}`);

                notifyProxyServer.push((message: string) => {
                    if (proxyWs && proxyWs.readyState === WebSocket.OPEN) {
                        proxyWs.send(message);
                    }
                })
            });

            proxyWs.on('message', (message) => {
                console.log('Message received from proxy server:', message.toString());
                // Broadcast the message to connected clients
                broadcast(wss, message.toString());
            });
        }

        console.log(`Client connected at: ${Date.now()}`);
        ws.on('message', function incoming(message) {
            const stringMessage = message.toString();
            console.log('Message received from client: ',stringMessage);
            for (const notify of notifyProxyServer) {
                notify(stringMessage);
            }
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
