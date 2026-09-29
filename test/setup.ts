import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterEach } from 'node:test';
import { afterAll, beforeAll } from 'vitest';

// Unit tests use mocked legacy services, regardless of the developer's local .env.
process.env.LEGACY_SCOPE_URL = '';

let mongo: MongoMemoryServer;

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const uri = mongo.getUri();
    await mongoose.connect(uri);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
});

afterEach(async () => {
    const collections = await mongoose.connection?.db?.collections();
    if (!collections) return;
    for (const collection of collections) {
        await collection.deleteMany({});
    }
});
