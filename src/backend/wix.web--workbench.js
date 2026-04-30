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
  logInfo("WIX WEB importCatalogImages start", {
    payload
  });

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

  logInfo("WIX WEB importCatalogImages normalized input", {
    hotelId,
    hotelName,
    hotelMainImage,
    hotelDisplayName,
    roomId,
    roomName,
    roomMainImage,
    roomDisplayName
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

  const result = {
    wixHotelMainImageRef,
    wixRoomMainImageRef
  };

  logInfo("WIX WEB importCatalogImages final result", result);

  return result;
}

async function importSingleImage({
  imageKind,
  sourceUrl,
  displayName,
  importContext = {}
}) {
  logInfo("WIX WEB importSingleImage start", {
    imageKind,
    sourceUrl,
    displayName,
    importContext
  });

  if (!sourceUrl) {
    logWarn("WIX WEB importSingleImage skipped: missing sourceUrl", {
      imageKind,
      displayName,
      importContext
    });
    return "";
  }

  let importResponse = null;

  try {
    importResponse = await elevatedImportFile(sourceUrl, {
      displayName,
      mimeType: "image/jpeg",
      mediaType: "IMAGE"
    });

    logInfo("WIX WEB importFile raw response", {
      imageKind,
      sourceUrl,
      displayName,
      importContext,
      responseKeys: safeKeys(importResponse),
      response: importResponse
    });
  } catch (error) {
    logError("WIX WEB importFile threw", {
      imageKind,
      sourceUrl,
      displayName,
      importContext,
      error
    });
    return "";
  }

  const fileIdExtraction = extractImportedFileId(importResponse);
  const immediateImportedRef = extractImmediateImportedRef(importResponse);

  logInfo("WIX WEB importFile fileId extraction", {
    imageKind,
    sourceUrl,
    displayName,
    importContext,
    fileId: fileIdExtraction.fileId,
    candidates: fileIdExtraction.candidates,
    immediateImportedRef
  });

  if (!fileIdExtraction.fileId) {
    if (immediateImportedRef) {
      logWarn(
        "WIX WEB importFile no fileId extracted, using immediate imported ref fallback",
        {
          imageKind,
          sourceUrl,
          displayName,
          importContext,
          immediateImportedRef
        }
      );
      return immediateImportedRef;
    }

    logWarn("WIX WEB importFile no fileId extracted", {
      imageKind,
      sourceUrl,
      displayName,
      importContext,
      importResponse
    });
    return "";
  }

  const bestImageRef = await resolveBestImageRef({
    imageKind,
    fileId: fileIdExtraction.fileId,
    fallbackRef: immediateImportedRef,
    importContext
  });

  logInfo("WIX WEB importSingleImage final resolved ref", {
    imageKind,
    sourceUrl,
    displayName,
    importContext,
    fileId: fileIdExtraction.fileId,
    bestImageRef
  });

  return bestImageRef;
}

async function resolveBestImageRef({
  imageKind,
  fileId,
  fallbackRef,
  importContext = {}
}) {
  for (let attempt = 1; attempt <= IMPORT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      logInfo("WIX WEB getFileDescriptor attempt start", {
        imageKind,
        fileId,
        attempt,
        maxAttempts: IMPORT_RETRY_ATTEMPTS,
        importContext
      });

      const descriptor = await elevatedGetFileDescriptor(fileId);

      logInfo("WIX WEB getFileDescriptor raw response", {
        imageKind,
        fileId,
        attempt,
        importContext,
        descriptorKeys: safeKeys(descriptor),
        descriptor
      });

      const refExtraction = extractBestImageRefFromDescriptor(descriptor);

      logInfo("WIX WEB getFileDescriptor image ref extraction", {
        imageKind,
        fileId,
        attempt,
        importContext,
        preferredRef: refExtraction.preferredRef,
        wixImageRef: refExtraction.wixImageRef,
        staticUrlRef: refExtraction.staticUrlRef,
        candidates: refExtraction.candidates
      });

      if (refExtraction.preferredRef) {
        return refExtraction.preferredRef;
      }

      logWarn("WIX WEB getFileDescriptor returned no usable image ref", {
        imageKind,
        fileId,
        attempt,
        importContext
      });
    } catch (error) {
      logError("WIX WEB getFileDescriptor threw", {
        imageKind,
        fileId,
        attempt,
        importContext,
        error
      });
    }

    if (attempt < IMPORT_RETRY_ATTEMPTS) {
      await sleep(IMPORT_RETRY_DELAY_MS);
    }
  }

  if (fallbackRef) {
    logWarn("WIX WEB resolveBestImageRef fell back to immediate imported ref", {
      imageKind,
      fileId,
      fallbackRef,
      importContext
    });
    return fallbackRef;
  }

  logWarn("WIX WEB resolveBestImageRef failed after retries", {
    imageKind,
    fileId,
    maxAttempts: IMPORT_RETRY_ATTEMPTS,
    importContext
  });

  return "";
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
    buildCandidate("uploadedFiles[0]._id", importResponse?.uploadedFiles?.[0]?._id),
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

function extractImmediateImportedRef(importResponse) {
  const candidates = [
    buildCandidate("file.url", importResponse?.file?.url),
    buildCandidate("file.thumbnailUrl", importResponse?.file?.thumbnailUrl),
    buildCandidate("fileDescriptor.url", importResponse?.fileDescriptor?.url),
    buildCandidate("fileDescriptor.fileUrl", importResponse?.fileDescriptor?.fileUrl),
    buildCandidate("url", importResponse?.url)
  ];

  const wixImageCandidate = candidates.find((item) =>
    String(item.value || "").startsWith("wix:image://")
  );

  if (wixImageCandidate?.value) {
    return wixImageCandidate.value;
  }

  const staticWixCandidate = candidates.find((item) =>
    isStaticWixMediaUrl(item.value)
  );
  return staticWixCandidate?.value || "";
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
    buildCandidate("fileDescriptor.media.url", descriptor?.fileDescriptor?.media?.url),
    buildCandidate("fileDescriptor.fileUrl", descriptor?.fileDescriptor?.fileUrl),
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

function safeKeys(value) {
  if (!value || typeof value !== "object") {
    return [];
  }

  try {
    return Object.keys(value);
  } catch (error) {
    return [];
  }
}

function safeJson(value) {
  try {
    return JSON.stringify(
      value,
      (key, currentValue) => {
        if (currentValue instanceof Error) {
          return {
            name: currentValue.name,
            message: currentValue.message,
            stack: currentValue.stack,
            ...Object.fromEntries(
              Object.getOwnPropertyNames(currentValue).map((name) => [
                name,
                currentValue[name]
              ])
            )
          };
        }

        return currentValue;
      },
      2
    );
  } catch (error) {
    return `[unserializable: ${String(error?.message || error)}]`;
  }
}

function logInfo(message, payload) {
  console.log(message, safeJson(payload));
}

function logWarn(message, payload) {
  console.warn(message, safeJson(payload));
}

function logError(message, payload) {
  console.error(message, safeJson(payload));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
