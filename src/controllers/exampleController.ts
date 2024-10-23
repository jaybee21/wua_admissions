import { Request, Response } from 'express';

export const exampleController = (req: Request, res: Response) => {
  res.send('This is an example route!');
};
