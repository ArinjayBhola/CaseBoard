import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth";

export const signupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Enter a username")
    .max(50, "Username must be 50 characters or fewer"),
  email: z.string().email("Enter a valid email address").transform((s) => s.trim().toLowerCase()),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`),
  imageUrl: z.string().max(1000).optional().nullable(),
});

export const updateUsernameSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Enter a username")
    .max(50, "Username must be 50 characters or fewer"),
});

export const updateProfileSchema = z.object({
  username: updateUsernameSchema.shape.username.optional(),
  imageUrl: z.string().max(1000).nullable().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`),
});

export const memberRoleSchema = z.enum(["editor", "viewer"]);

export const inviteMemberSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  role: memberRoleSchema.default("editor"),
});

export const updateMemberSchema = z.object({
  role: memberRoleSchema,
});

export const shareLinkSchema = z
  .object({
    duration: z.enum(["1h", "infinite", "custom"]).default("1h"),
    // Required only for a custom duration; capped at one year.
    minutes: z.number().int().positive().max(60 * 24 * 365).optional(),
  })
  .refine((v) => v.duration !== "custom" || (v.minutes && v.minutes > 0), {
    message: "Enter how many minutes the link should stay open",
    path: ["minutes"],
  });

export const createCaseSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional().nullable(),
});

export const updateCaseSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
});

const tags = z.array(z.string().trim().min(1).max(40)).max(30);

export const createPersonSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  photoUrl: z.string().max(500).optional().nullable(),
  notes: z.string().max(10000).optional().nullable(),
  tags: tags.optional(),
  role: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  source: z.string().trim().max(200).optional().nullable(),
  x: z.number().finite(),
  y: z.number().finite(),
});

export const updatePersonSchema = createPersonSchema.partial();

/** Autosave payload: many card positions at once after a drag. */
export const movePeopleSchema = z.object({
  positions: z
    .array(
      z.object({
        id: z.string().min(1),
        x: z.number().finite(),
        y: z.number().finite(),
      }),
    )
    .min(1)
    .max(500),
});

// ---- Phase 2: connectors ----------------------------------------------------

export const CONFIDENCE = ["confirmed", "alleged", "unconfirmed"] as const;
export const DIRECTION = ["none", "forward", "both"] as const;

const confidence = z.enum(CONFIDENCE);
const direction = z.enum(DIRECTION);

export const createConnectorSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  label: z.string().trim().max(200).optional().nullable(),
  confidence: confidence.default("unconfirmed"),
  direction: direction.default("none"),
});

export const updateConnectorSchema = z.object({
  label: z.string().trim().max(200).optional().nullable(),
  confidence: confidence.optional(),
  direction: direction.optional(),
});

// ---- Phase 2: groups --------------------------------------------------------

export const createGroupSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(120),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().min(40),
  height: z.number().finite().min(40),
  memberIds: z.array(z.string().min(1)).max(500).default([]),
});

export const updateGroupSchema = createGroupSchema.partial();

/** Autosave payload for group boxes moved or resized. */
export const moveGroupsSchema = z.object({
  boxes: z
    .array(
      z.object({
        id: z.string().min(1),
        x: z.number().finite(),
        y: z.number().finite(),
        width: z.number().finite().min(40),
        height: z.number().finite().min(40),
      }),
    )
    .min(1)
    .max(200),
});

// ---- Phase 2: import --------------------------------------------------------

/**
 * Shape of an exported board. Ids in the file are treated as local references
 * only — import remaps every one to a fresh cuid, so a file can be imported
 * repeatedly without collisions.
 */
export const importBoardSchema = z.object({
  case: z
    .object({
      id: z.string().optional(),
      title: z.string().optional(),
      exportedAt: z.string().optional(),
    })
    .optional(),
  people: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(120),
        photoUrl: z.string().max(500).optional().nullable(),
        notes: z.string().max(10000).optional().nullable(),
        tags: z.array(z.string().trim().max(40)).max(30).optional(),
        role: z.string().trim().max(120).optional().nullable(),
        location: z.string().trim().max(120).optional().nullable(),
        source: z.string().trim().max(200).optional().nullable(),
        x: z.number().finite(),
        y: z.number().finite(),
      }),
    )
    .max(1000),
  connectors: z
    .array(
      z.object({
        id: z.string().optional(),
        fromId: z.string().min(1),
        toId: z.string().min(1),
        label: z.string().trim().max(200).optional().nullable(),
        confidence: confidence.catch("unconfirmed"),
        direction: direction.optional().nullable(),
      }),
    )
    .max(2000)
    .optional()
    .default([]),
  groups: z
    .array(
      z.object({
        id: z.string().optional(),
        label: z.string().trim().min(1).max(120),
        x: z.number().finite(),
        y: z.number().finite(),
        width: z.number().finite().min(40),
        height: z.number().finite().min(40),
        memberIds: z.array(z.string()).max(500).optional().default([]),
      }),
    )
    .max(200)
    .optional()
    .default([]),
});

export const importRequestSchema = z.object({
  board: importBoardSchema,
  /** Must be true to wipe an existing board. Guards against accidental overwrite. */
  replace: z.boolean().default(false),
});
