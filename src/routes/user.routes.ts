import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { validateCreateUser } from '../middlewares/user.validator.js';
import { validateMongoId } from '../middlewares/mongoId.validator.js';

export const userRoutes = Router();

userRoutes.get('/', userController.getUsers);
userRoutes.get('/:id', validateMongoId, userController.getUserById);
userRoutes.post('/', validateCreateUser, userController.createUser);
userRoutes.put('/:id', validateMongoId, validateCreateUser, userController.updateUser);
userRoutes.delete('/:id', validateMongoId, userController.deleteUser);
