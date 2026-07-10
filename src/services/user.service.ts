import * as userRepository from '../repositories/user.repository.js';
import { IUser } from '../models/user.model.js';

export const createUser = async (data: Partial<IUser>) => {
    return await userRepository.createUser(data);
};

export const getUsers = async () => {
    return await userRepository.getUsers();
};

export const getUserById = async (id: string) => {
    return await userRepository.getUserById(id);
};

export const updateUser = async (id: string, data: Partial<IUser>) => {
    return await userRepository.updateUser(id, data);
};

export const deleteUser = async (id: string) => {
    return await userRepository.deleteUser(id);
};
