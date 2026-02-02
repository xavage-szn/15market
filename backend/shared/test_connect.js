
const { createClient } = require('redis');

(async () => {
    const client = createClient({
        username: 'default',
        password: 'ueZrTByLR9Iq6lbmqJwRNxv0YJuUoNYj',
        socket: {
            host: 'redis-14672.c277.us-east-1-3.ec2.cloud.redislabs.com',
            port: 14672
        }
    });

    client.on('error', err => console.log('Redis Client Error', err));

    await client.connect();
    console.log('Connected!');

    await client.set('foo', 'bar');
    const result = await client.get('foo');
    console.log('Result for key foo:', result);  // >>> bar

    await client.disconnect();
})();
