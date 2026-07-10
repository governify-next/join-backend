import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

// Helper for random email
function randomEmail() {
    return `user${Math.floor(Math.random() * 100000)}@example.com`;
}

describe('Users API', () => {
    it('[+] [User] It should create a user with valid data', async () => {
        const res = await request(app)
            .post('/api/v1/users')
            .send({ name: 'Test User', email: randomEmail(), password: '123456' });
        expect(res.status).toBe(201);
        expect(res.body.data).toBeDefined();
        expect(res.body.data.email).toMatch(/@example.com$/);
        expect(res.body.success).toBe(true);
    });

    it('[+] [User] It should list users', async () => {
        const email = randomEmail();
        await request(app)
            .post('/api/v1/users')
            .send({ name: 'List User', email, password: '123456' });
        const res = await request(app).get('/api/v1/users');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.some((u: { email: string }) => u.email === email)).toBe(true);
        expect(res.body.success).toBe(true);
    });

    it('[+] [User] It should get user by id', async () => {
        const email = randomEmail();
        const createRes = await request(app)
            .post('/api/v1/users')
            .send({ name: 'GetById', email, password: '123456' });
        const id = createRes.body.data._id;
        const res = await request(app).get(`/api/v1/users/${id}`);
        expect(res.status).toBe(200);
        expect(res.body.data.email).toBe(email);
        expect(res.body.success).toBe(true);
    });

    it('[+] [User] It should update user by id', async () => {
        const email = randomEmail();
        const createRes = await request(app)
            .post('/api/v1/users')
            .send({ name: 'UpdateUser', email, password: '123456' });
        const id = createRes.body.data._id;
        const res = await request(app)
            .put(`/api/v1/users/${id}`)
            .send({ name: 'Updated Name', email, password: '654321' });
        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('Updated Name');
        expect(res.body.success).toBe(true);
    });

    it('[+] [User] It should delete user by id', async () => {
        const email = randomEmail();
        const createRes = await request(app)
            .post('/api/v1/users')
            .send({ name: 'DeleteUser', email, password: '123456' });
        const id = createRes.body.data._id;
        const res = await request(app).delete(`/api/v1/users/${id}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toBe(null);
        expect(res.body.success).toBe(true);
    });
});

describe('User API [-]', () => {
    it('[-] [User] It should not create user with missing fields', async () => {
        const res = await request(app)
            .post('/api/v1/users')
            .send({ email: randomEmail(), password: '123456' }); // missing name
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });

    it('[-] [User] It should not create user with invalid email', async () => {
        const res = await request(app)
            .post('/api/v1/users')
            .send({ name: 'InvalidEmail', email: 'not-an-email', password: '123456' });
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });

    it('[-] [User] It should not create user with short password', async () => {
        const res = await request(app)
            .post('/api/v1/users')
            .send({ name: 'ShortPass', email: randomEmail(), password: '123' });
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });

    it('[-] [User] It should not get user with invalid id', async () => {
        const res = await request(app).get('/api/v1/users/invalidid');
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });

    it('[-] [User] It should not get user with non-existent id', async () => {
        const fakeId = '507f1f77bcf86cd799439011';
        const res = await request(app).get(`/api/v1/users/${fakeId}`);
        expect(res.status).toBe(404);
        expect(res.body.error).toBeDefined();
    });

    it('[-] [User] It should not update user with invalid id', async () => {
        const res = await request(app)
            .put('/api/v1/users/invalidid')
            .send({ name: 'Name', email: randomEmail(), password: '123456' });
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });

    it('[-] [User] It should not update user with non-existent id', async () => {
        const fakeId = '507f1f77bcf86cd799439011';
        const res = await request(app)
            .put(`/api/v1/users/${fakeId}`)
            .send({ name: 'Name', email: randomEmail(), password: '123456' });
        expect(res.status).toBe(404);
        expect(res.body.error).toBeDefined();
    });

    it('[-] [User] It should not delete user with invalid id', async () => {
        const res = await request(app).delete('/api/v1/users/invalidid');
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });

    it('[-] [User] It should not delete user with non-existent id', async () => {
        const fakeId = '507f1f77bcf86cd799439011';
        const res = await request(app).delete(`/api/v1/users/${fakeId}`);
        expect(res.status).toBe(404);
        expect(res.body.error).toBeDefined();
    });

    it('[-] [User] It should not create user with too long name', async () => {
        const res = await request(app)
            .post('/api/v1/users')
            .send({ name: 'A'.repeat(51), email: randomEmail(), password: '123456' });
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });
});
