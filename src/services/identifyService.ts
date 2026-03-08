import { Contact } from "@prisma/client";
import prisma from "../lib/prisma";

interface IdentifyRequest {
  email?: string | null;
  phoneNumber?: string | null;
}

interface IdentifyResponse {
  contact: {
    primaryContatctId: number;
    emails: string[];
    phoneNumbers: string[];
    secondaryContactIds: number[];
  };
}

function buildResponse(
  contacts: Contact[],
  primaryId?: number
): IdentifyResponse {
  const primary = primaryId
    ? contacts.find((c) => c.id === primaryId)!
    : contacts[0];

  const secondaries = contacts
    .filter((c) => c.id !== primary.id)
    .sort((a, b) => a.id - b.id);

  // Primary's email/phone first, then unique others in order
  const emails: string[] = [];
  if (primary.email) emails.push(primary.email);
  for (const c of secondaries) {
    if (c.email && !emails.includes(c.email)) emails.push(c.email);
  }

  const phoneNumbers: string[] = [];
  if (primary.phoneNumber) phoneNumbers.push(primary.phoneNumber);
  for (const c of secondaries) {
    if (c.phoneNumber && !phoneNumbers.includes(c.phoneNumber))
      phoneNumbers.push(c.phoneNumber);
  }

  return {
    contact: {
      primaryContatctId: primary.id, // intentional typo to match spec
      emails,
      phoneNumbers,
      secondaryContactIds: secondaries.map((c) => c.id),
    },
  };
}

export async function identifyContact(
  req: IdentifyRequest
): Promise<IdentifyResponse> {
  const email = req.email ?? null;
  const phoneNumber = req.phoneNumber ?? null;

  if (!email && !phoneNumber) {
    throw new Error("At least one of email or phoneNumber must be provided");
  }

  // ── 1. Find all directly matching contacts ──────────────────────────────
  const orConditions: { email?: string; phoneNumber?: string }[] = [];
  if (email) orConditions.push({ email });
  if (phoneNumber) orConditions.push({ phoneNumber });

  const matchedContacts = await prisma.contact.findMany({
    where: { OR: orConditions, deletedAt: null },
  });

  // ── 2. No existing contacts → create new primary ─────────────────────────
  if (matchedContacts.length === 0) {
    const newContact = await prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkedId: null,
        linkPrecedence: "primary",
      },
    });
    return buildResponse([newContact]);
  }

  // ── 3. Collect root primary IDs from matched contacts ────────────────────
  const primaryIdSet = new Set<number>();
  for (const c of matchedContacts) {
    if (c.linkPrecedence === "primary") {
      primaryIdSet.add(c.id);
    } else if (c.linkedId !== null) {
      primaryIdSet.add(c.linkedId);
    }
  }

  // Load all primaries and sort oldest → newest
  const primaryContacts = await prisma.contact.findMany({
    where: { id: { in: Array.from(primaryIdSet) }, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });

  // Guard: if no primaries loaded (edge-case: all parents deleted), promote oldest matched
  if (primaryContacts.length === 0) {
    const oldest = [...matchedContacts].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    )[0];
    primaryIdSet.clear();
    primaryIdSet.add(oldest.id);
    primaryContacts.push(oldest);
  }

  const oldestPrimary = primaryContacts[0];

  // ── 4. Merge multiple primaries into one cluster ─────────────────────────
  if (primaryContacts.length > 1) {
    const demotedIds = primaryContacts.slice(1).map((p) => p.id);

    // Demote other primaries → secondary
    await prisma.contact.updateMany({
      where: { id: { in: demotedIds } },
      data: {
        linkPrecedence: "secondary",
        linkedId: oldestPrimary.id,
        updatedAt: new Date(),
      },
    });

    // Re-link existing secondaries of demoted primaries to the oldest primary
    await prisma.contact.updateMany({
      where: { linkedId: { in: demotedIds }, deletedAt: null },
      data: { linkedId: oldestPrimary.id, updatedAt: new Date() },
    });
  }

  // ── 5. Reload full cluster ────────────────────────────────────────────────
  const clusterContacts = await prisma.contact.findMany({
    where: {
      OR: [{ id: oldestPrimary.id }, { linkedId: oldestPrimary.id }],
      deletedAt: null,
    },
  });

  // ── 6. Create secondary if request carries new information ────────────────
  const clusterEmails = new Set(clusterContacts.map((c) => c.email));
  const clusterPhones = new Set(clusterContacts.map((c) => c.phoneNumber));

  const emailIsNew = email !== null && !clusterEmails.has(email);
  const phoneIsNew = phoneNumber !== null && !clusterPhones.has(phoneNumber);

  if (emailIsNew || phoneIsNew) {
    const newSecondary = await prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkedId: oldestPrimary.id,
        linkPrecedence: "secondary",
      },
    });
    clusterContacts.push(newSecondary);
  }

  return buildResponse(clusterContacts, oldestPrimary.id);
}
