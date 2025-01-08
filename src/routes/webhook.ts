import { Router, Request, Response } from 'express';

const router = Router();


/**
 * @swagger
 * /api/v1/webhook:
 *   post:
 *     summary: Handle GitHub webhook events
 *     tags: [Webhooks]
 *     description: This endpoint receives webhook events from GitHub.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ref:
 *                 type: string
 *                 description: The Git reference that triggered the event.
 *               before:
 *                 type: string
 *                 description: The SHA of the previous commit.
 *               after:
 *                 type: string
 *                 description: The SHA of the new commit.
 *               repository:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                     description: The name of the repository.
 *                   url:
 *                     type: string
 *                     description: The URL of the repository.
 *               pusher:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                     description: The username of the person who pushed the code.
 *     responses:
 *       200:
 *         description: Webhook received successfully.
 *       400:
 *         description: Bad Request.
 *       500:
 *         description: Internal Server Error.
 */

router.post('/', (req: Request, res: Response) => {
  const event = req.headers['x-github-event']; // Get the event type from headers
  const payload = req.body; // GitHub sends the payload in the request body

  console.log(`Received GitHub Event: ${event}`);
  console.log('Payload:', payload);

  // Add custom handling for specific events
  if (event === 'push') {
    console.log('Code was pushed to the repository!');
    // Add your custom logic here
  } else {
    console.log(`Unhandled event: ${event}`);
  }

  res.status(200).send('Webhook received');
});

export default router;
