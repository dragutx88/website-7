import { Permissions, webMethod } from "wix-web-module";
import { elevate } from "wix-auth";
import { files } from "wix-media.v2";

const elevatedImportFile = elevate(files.importFile);
const elevatedGetFileDescriptor = elevate(files.getFileDescriptor);

const IMPORT_RETRY_ATTEMPTS = 3;
const IMPORT_RETRY_DELAY_MS = 400;

export const importCatalogImages = webMethod(
  Permissions.Anyone,
  async (payload) => {
    return importCatalogImagesHandler(payload);
  }
);

async function importCatalogImagesHandler(payload) {
  const hotelId = normalizeText(payload?.hotelId);
  const hotelName = normalizeDisplayName(payload?.hotelName) || "Hotel";
  const hotelMainImage = normalizeText(
    payload?.hotelMainImage || payload?.hotelMainImageUrl
  );

  const roomId = normalizeText(payload?.roomId);
  const roomName =
    normalizeDisplayName(payload?.roomName || payload?.mappedRoomName) ||
    "Room";
  const roomMainImage = normalizeText(
    payload?.roomMainImage || payload?.roomMainImageUrl
  );

  const hotelDisplayName = buildHotelImageDisplayName({
    hotelId,
    hotelName
  });

  const roomDisplayName = buildRoomImageDisplayName({
    hotelId,
    hotelName,
    roomId,
    roomName
  });

  console.log("WIX WEB importCatalogImages start", {
    hasHotelId: Boolean(hotelId),
    hasHotelName: Boolean(hotelName),
    hasHotelMainImage: Boolean(hotelMainImage),
    hasHotelDisplayName: Boolean(hotelDisplayName),
    hasRoomId: Boolean(roomId),
    hasRoomName: Boolean(roomName),
    hasRoomMainImage: Boolean(roomMainImage),
    hasRoomDisplayName: Boolean(roomDisplayName)
  });

  const hotelImageImportPromise = importSingleImage({
    imageKind: "hotelMainImage",
    sourceUrl: hotelMainImage,
    displayName: hotelDisplayName,
    importContext: {
      hotelId,
      hotelName,
      hotelMainImage
    }
  });

  const roomImageImportPromise = importSingleImage({
    imageKind: "roomMainImage",
    sourceUrl: roomMainImage,
    displayName: roomDisplayName,
    importContext: {
      hotelId,
      hotelName,
      roomId,
      roomName,
      roomMainImage
    }
  });

  const [wixHotelMainImageRef, wixRoomMainImageRef] = await Promise.all([
    hotelImageImportPromise,
    roomImageImportPromise
  ]);

  if (!wixHotelMainImageRef) {
    throw new Error("wixHotelMainImageRef is required.");
  }

  if (!wixRoomMainImageRef) {
    throw new Error("wixRoomMainImageRef is required.");
  }

  const result = {
    wixHotelMainImageRef,
    wixRoomMainImageRef
  };

  console.log("WIX WEB importCatalogImages success", {
    hasWixHotelMainImageRef: Boolean(wixHotelMainImageRef),
    hasWixRoomMainImageRef: Boolean(wixRoomMainImageRef)
  });

  return result;
}

async function importSingleImage({
  imageKind,
  sourceUrl,
  displayName,
  importContext = {}
}) {
  const normalizedSourceUrl = normalizeText(sourceUrl);
  const normalizedDisplayName = normalizeDisplayName(displayName);

  console.log("WIX WEB importSingleImage start", {
    imageKind,
    hasSourceUrl: Boolean(normalizedSourceUrl),
    hasDisplayName: Boolean(normalizedDisplayName),
    importContext
  });

  if (!normalizedSourceUrl) {
    throw new Error(`${imageKind} sourceUrl is required.`);
  }

  if (!normalizedDisplayName) {
    throw new Error(`${imageKind} displayName is required.`);
  }

  let importResponse = null;

  try {
    importResponse = await elevatedImportFile(normalizedSourceUrl, {
      displayName: normalizedDisplayName,
      mimeType: "image/jpeg",
      mediaType: "IMAGE"
    });
  } catch (error) {
    console.error("WIX WEB importFile failed", {
      imageKind,
      hasSourceUrl: Boolean(normalizedSourceUrl),
      hasDisplayName: Boolean(normalizedDisplayName),
      importContext,
      name: error?.name,
      message: error?.message,
      stack: error?.stack
    });

    throw error;
  }

  const fileIdExtraction = extractImportedFileId(importResponse);

  console.log("WIX WEB importFile result", {
    imageKind,
    hasSourceUrl: Boolean(normalizedSourceUrl),
    hasDisplayName: Boolean(normalizedDisplayName),
    importContext,
    responseKeys:
      importResponse && typeof importResponse === "object"
        ? Object.keys(importResponse)
        : [],
    hasFileId: Boolean(fileIdExtraction.fileId),
    fileIdCandidatePaths: fileIdExtraction.candidates
      .filter((candidate) => Boolean(candidate.value))
      .map((candidate) => candidate.path)
  });

  if (!fileIdExtraction.fileId) {
    throw new Error(`${imageKind} importFile response did not include a file id.`);
  }

  const bestImageRef = await resolveBestImageRef({
    imageKind,
    fileId: fileIdExtraction.fileId,
    importContext
  });

  if (!bestImageRef) {
    throw new Error(`${imageKind} image ref could not be resolved.`);
  }

  console.log("WIX WEB importSingleImage success", {
    imageKind,
    hasSourceUrl: Boolean(normalizedSourceUrl),
    hasDisplayName: Boolean(normalizedDisplayName),
    importContext,
    hasFileId: Boolean(fileIdExtraction.fileId),
    hasBestImageRef: Boolean(bestImageRef)
  });

  return bestImageRef;
}

async function resolveBestImageRef({
  imageKind,
  fileId,
  importContext = {}
}) {
  const normalizedFileId = normalizeText(fileId);

  if (!normalizedFileId) {
    throw new Error(`${imageKind} fileId is required.`);
  }

  let lastDescriptorError = null;

  for (let attempt = 1; attempt <= IMPORT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      console.log("WIX WEB getFileDescriptor attempt start", {
        imageKind,
        hasFileId: Boolean(normalizedFileId),
        attempt,
        maxAttempts: IMPORT_RETRY_ATTEMPTS,
        importContext
      });

      const descriptor = await elevatedGetFileDescriptor(normalizedFileId);
      const refExtraction = extractBestImageRefFromDescriptor(descriptor);

      console.log("WIX WEB getFileDescriptor attempt result", {
        imageKind,
        hasFileId: Boolean(normalizedFileId),
        attempt,
        maxAttempts: IMPORT_RETRY_ATTEMPTS,
        importContext,
        descriptorKeys:
          descriptor && typeof descriptor === "object"
            ? Object.keys(descriptor)
            : [],
        hasPreferredRef: Boolean(refExtraction.preferredRef),
        hasWixImageRef: Boolean(refExtraction.wixImageRef),
        hasStaticUrlRef: Boolean(refExtraction.staticUrlRef),
        refCandidatePaths: refExtraction.candidates
          .filter((candidate) => Boolean(candidate.value))
          .map((candidate) => candidate.path)
      });

      if (refExtraction.preferredRef) {
        return refExtraction.preferredRef;
      }
    } catch (error) {
      lastDescriptorError = error;

      console.error("WIX WEB getFileDescriptor attempt failed", {
        imageKind,
        hasFileId: Boolean(normalizedFileId),
        attempt,
        maxAttempts: IMPORT_RETRY_ATTEMPTS,
        importContext,
        name: error?.name,
        message: error?.message,
        stack: error?.stack
      });
    }

    if (attempt < IMPORT_RETRY_ATTEMPTS) {
      await sleep(IMPORT_RETRY_DELAY_MS);
    }
  }

  if (lastDescriptorError) {
    throw lastDescriptorError;
  }

  throw new Error(
    `${imageKind} getFileDescriptor did not return a usable image ref.`
  );
}

function buildHotelImageDisplayName({ hotelId, hotelName }) {
  const normalizedHotelName = normalizeDisplayName(hotelName) || "Hotel";
  const normalizedHotelId = normalizeDisplayName(hotelId);

  return normalizeDisplayName(
    [
      "Hotel",
      normalizedHotelName,
      normalizedHotelId ? `hotelId_${normalizedHotelId}` : ""
    ]
      .filter(Boolean)
      .join(" - ")
  );
}

function buildRoomImageDisplayName({ hotelId, hotelName, roomId, roomName }) {
  const normalizedHotelName = normalizeDisplayName(hotelName) || "Hotel";
  const normalizedRoomName = normalizeDisplayName(roomName) || "Room";
  const normalizedHotelId = normalizeDisplayName(hotelId);
  const normalizedRoomId = normalizeDisplayName(roomId);

  return normalizeDisplayName(
    [
      "Room",
      normalizedHotelName,
      normalizedRoomName,
      normalizedHotelId ? `hotelId_${normalizedHotelId}` : "",
      normalizedRoomId ? `roomId_${normalizedRoomId}` : ""
    ]
      .filter(Boolean)
      .join(" - ")
  );
}

function extractImportedFileId(importResponse) {
  const candidates = [
    buildCandidate("file.id", importResponse?.file?.id),
    buildCandidate("file._id", importResponse?.file?._id),
    buildCandidate("fileId", importResponse?.fileId),
    buildCandidate("id", importResponse?.id),
    buildCandidate("_id", importResponse?._id),
    buildCandidate("fileDescriptor.id", importResponse?.fileDescriptor?.id),
    buildCandidate("fileDescriptor._id", importResponse?.fileDescriptor?._id),
    buildCandidate("files[0].id", importResponse?.files?.[0]?.id),
    buildCandidate("files[0]._id", importResponse?.files?.[0]?._id),
    buildCandidate("files[0].file.id", importResponse?.files?.[0]?.file?.id),
    buildCandidate("files[0].file._id", importResponse?.files?.[0]?.file?._id),
    buildCandidate("files[0].fileId", importResponse?.files?.[0]?.fileId),
    buildCandidate("uploadedFiles[0].id", importResponse?.uploadedFiles?.[0]?.id),
    buildCandidate(
      "uploadedFiles[0]._id",
      importResponse?.uploadedFiles?.[0]?._id
    ),
    buildCandidate(
      "uploadedFiles[0].file.id",
      importResponse?.uploadedFiles?.[0]?.file?.id
    ),
    buildCandidate(
      "uploadedFiles[0].file._id",
      importResponse?.uploadedFiles?.[0]?.file?._id
    )
  ];

  const firstHit = candidates.find((item) => item.value);

  return {
    fileId: firstHit?.value || "",
    candidates
  };
}

function extractBestImageRefFromDescriptor(descriptor) {
  const candidates = [
    buildCandidate("media.image.image", descriptor?.media?.image?.image),
    buildCandidate("media.image._id", descriptor?.media?.image?._id),
    buildCandidate("media.image.id", descriptor?.media?.image?.id),
    buildCandidate("media.image.url", descriptor?.media?.image?.url),
    buildCandidate("media.image.fileUrl", descriptor?.media?.image?.fileUrl),
    buildCandidate("media.url", descriptor?.media?.url),
    buildCandidate("fileUrl", descriptor?.fileUrl),
    buildCandidate("url", descriptor?.url),

    buildCandidate(
      "fileDescriptor.media.image.image",
      descriptor?.fileDescriptor?.media?.image?.image
    ),
    buildCandidate(
      "fileDescriptor.media.image._id",
      descriptor?.fileDescriptor?.media?.image?._id
    ),
    buildCandidate(
      "fileDescriptor.media.image.id",
      descriptor?.fileDescriptor?.media?.image?.id
    ),
    buildCandidate(
      "fileDescriptor.media.image.url",
      descriptor?.fileDescriptor?.media?.image?.url
    ),
    buildCandidate(
      "fileDescriptor.media.image.fileUrl",
      descriptor?.fileDescriptor?.media?.image?.fileUrl
    ),
    buildCandidate(
      "fileDescriptor.media.url",
      descriptor?.fileDescriptor?.media?.url
    ),
    buildCandidate(
      "fileDescriptor.fileUrl",
      descriptor?.fileDescriptor?.fileUrl
    ),
    buildCandidate("fileDescriptor.url", descriptor?.fileDescriptor?.url)
  ];

  const wixImageCandidate = candidates.find((item) =>
    String(item.value || "").startsWith("wix:image://")
  );

  const staticUrlCandidate = candidates.find((item) =>
    isStaticWixMediaUrl(item.value)
  );

  return {
    preferredRef: wixImageCandidate?.value || staticUrlCandidate?.value || "",
    wixImageRef: wixImageCandidate?.value || "",
    staticUrlRef: staticUrlCandidate?.value || "",
    candidates
  };
}

function isStaticWixMediaUrl(value) {
  const normalized = normalizeText(value);
  return (
    normalized.startsWith("https://static.wixstatic.com/media/") ||
    normalized.startsWith("http://static.wixstatic.com/media/")
  );
}

function buildCandidate(path, rawValue) {
  return {
    path,
    value: normalizeText(rawValue)
  };
}

function normalizeDisplayName(value) {
  return normalizeText(value)
    .replace(/[\\/:*?"<>|#]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 120);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : String(value || "").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
