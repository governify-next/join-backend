import User, { IUser } from '../models/user.model.js';

import { DuplicateKeyError } from '../utils/customErrors.js';

export const createUser = async (data: Partial<IUser>) => {
    try {
        const user = new User(data);
        return await user.save();
    } catch (err) {
        const e = err as {
            code?: number;
            keyPattern?: { email?: number };
            keyValue?: unknown;
            message?: string;
        };

        if (e.code === 11000 && e.keyPattern?.email) {
            throw new DuplicateKeyError(
                'A user with that email already exists',
                e.keyValue || e.message,
            );
        }
        throw err;
    }
};

export const getUsers = async () => {
    return await User.find();
};

export const getUserById = async (id: string) => {
    return await User.findById(id);
};

export const updateUser = async (id: string, data: Partial<IUser>) => {
    try {
        return await User.findByIdAndUpdate(id, data, { new: true });
    } catch (err) {
        const e = err as {
            code?: number;
            keyPattern?: { email?: number };
            keyValue?: unknown;
            message?: string;
        };
        if (e.code === 11000 && e.keyPattern && e.keyPattern.email) {
            throw new DuplicateKeyError(
                'A user with that email already exists',
                e.keyValue || e.message,
            );
        }
        throw err;
    }
};

export const deleteUser = async (id: string) => {
    return await User.findByIdAndDelete(id);
};
