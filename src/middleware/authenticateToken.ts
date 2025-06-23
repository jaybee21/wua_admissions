import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload, VerifyErrors } from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string | number;
    username?: string;
    role?: string;
    firstName?: string;
    campus?: string;
  };
}

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.sendStatus(401);
    return;
  }

  jwt.verify(token, process.env.SECRET_KEY ?? 'default-secret-key', (err: VerifyErrors | null, user: JwtPayload | string | undefined): void => {
    if (err) {
      res.sendStatus(403); // Token is invalid, return 403 Forbidden
      return; // Ensure no further code is executed
    }

    if (user && typeof user === 'object') {
      if ('customerId' in user) {
        req.user = { id: user.customerId, firstName: user.firstName };
      } else if ('userId' in user) {
        req.user = { id: user.userId, username: user.username, role: user.role,campus: user.campus };
      } else {
        res.sendStatus(403); // Invalid payload
        return;
      }
      next();
    } else {
      res.sendStatus(403);
    }
  });
};