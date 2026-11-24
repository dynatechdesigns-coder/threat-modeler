import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const signToken = (userId, { expiresIn } = {}) =>
  jwt.sign({ sub: userId }, env.jwtSecret, { algorithm: 'HS256', expiresIn: expiresIn || env.jwtExpiresIn });

export const verifyToken = (token) => jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
