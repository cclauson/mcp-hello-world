import type { RequestHandler, Request, Response } from 'express';

export interface AuthProvider {
  middleware: RequestHandler[];
  handleProtectedResourceMetadata(req: Request, res: Response): void;
  handleAuthServerMetadata(req: Request, res: Response): void;
}
