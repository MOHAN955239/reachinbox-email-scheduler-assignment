import { Router } from "express";
import multer from "multer";
import { requireGoogleAuth } from "./authMiddleware";
import { asyncHandler } from "../middleware/asyncHandler";
import {
  getSenders,
  uploadLeads,
  createBatch,
  listScheduled,
  listSent,
} from "../controllers/emailController";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export const emailsRouter = Router();

emailsRouter.use(asyncHandler(requireGoogleAuth));

emailsRouter.get("/senders", asyncHandler(getSenders));
emailsRouter.post("/leads/upload", upload.single("file"), asyncHandler(uploadLeads));
emailsRouter.post("/batches", asyncHandler(createBatch));
emailsRouter.get("/emails/scheduled", asyncHandler(listScheduled));
emailsRouter.get("/emails/sent", asyncHandler(listSent));
