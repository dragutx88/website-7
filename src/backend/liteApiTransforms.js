export function getCurrentPriceObject(rate, roomType) {
  const retailRateTotal = firstPriceObject(rate?.retailRate?.total);
  if (retailRateTotal) {
    return retailRateTotal;
  }

  const offerRetailRateTotal = firstPriceObject(rate?.offerRetailRate?.total);
  if (offerRetailRateTotal) {
    return offerRetailRateTotal;
  }

  const roomTypeRetailRateTotal = firstPriceObject(roomType?.retailRate?.total);
  if (roomTypeRetailRateTotal) {
    return roomTypeRetailRateTotal;
  }

  return firstPriceObject(roomType?.offerRetailRate?.total);
}

export function getBeforePriceObject(rate, currentPrice, roomType) {
  const candidates = [
    firstPriceObject(rate?.offerSuggestedSellingPrice),
    firstPriceObject(rate?.suggestedSellingPrice),
    firstPriceObject(roomType?.offerSuggestedSellingPrice),
    firstPriceObject(roomType?.suggestedSellingPrice)
  ].filter(Boolean);

  if (!currentPrice || !candidates.length) {
    return null;
  }

  const candidate = candidates.find(
    (item) =>
      item.currency === currentPrice.currency &&
      item.amount > currentPrice.amount
  );

  return candidate || null;
}

export function firstPriceObject(value) {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const amount = Number(candidate.amount);
  const currency = String(candidate.currency || "").trim();

  if (!Number.isFinite(amount) || !currency) {
    return null;
  }

  return { amount, currency };
}

export function buildLiteApiOccupancies(occupancy) {
  const adults = normalizePositiveInteger(occupancy?.adults, 2, 1);
  const childrenCount = normalizeNonNegativeInteger(occupancy?.children, 0);

  const rawChildAges = Array.isArray(occupancy?.childAges)
    ? occupancy.childAges
    : [];

  const childAges = rawChildAges
    .slice(0, childrenCount)
    .map((age) => normalizeChildAge(age));

  if (childrenCount > 0 && childAges.length !== childrenCount) {
    throw new Error("Please select all child ages.");
  }

  const roomOccupancy = { adults };

  if (childAges.length > 0) {
    roomOccupancy.children = childAges;
  }

  return [roomOccupancy];
}

export function buildPriceNote(searchFormData, rate) {
  const nights = getNightCount(
    searchFormData?.checkIn || searchFormData?.checkin,
    searchFormData?.checkOut || searchFormData?.checkout
  );

  const roomCount = 1;
  const roomText = roomCount === 1 ? "1 room" : `${roomCount} rooms`;
  const nightText = nights === 1 ? "1 night" : `${nights} nights`;

  const taxesNote = getTaxesAndFeesNote(rate);

  return `${nightText}, ${roomText}, ${taxesNote}`;
}

export function getTaxesAndFeesNote(rate) {
  const taxesAndFees = Array.isArray(rate?.retailRate?.taxesAndFees)
    ? rate.retailRate.taxesAndFees
    : Array.isArray(rate?.offerRetailRate?.taxesAndFees)
    ? rate.offerRetailRate.taxesAndFees
    : null;

  if (!taxesAndFees || taxesAndFees.length === 0) {
    return "incl. taxes & fees";
  }

  const hasExcludedTaxesOrFees = taxesAndFees.some(
    (item) => item?.included === false
  );

  return hasExcludedTaxesOrFees
    ? "excl. some taxes & fees"
    : "incl. taxes & fees";
}

export function getNightCount(checkIn, checkOut) {
  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);

  if (
    Number.isNaN(checkInDate.getTime()) ||
    Number.isNaN(checkOutDate.getTime())
  ) {
    return 1;
  }

  const differenceMs = checkOutDate.getTime() - checkInDate.getTime();
  const nights = Math.round(differenceMs / (1000 * 60 * 60 * 24));

  return nights > 0 ? nights : 1;
}

export function normalizeBedTypes(bedTypes) {
  if (!Array.isArray(bedTypes)) {
    return [];
  }

  return bedTypes
    .map((bed) => {
      if (typeof bed === "string") {
        return bed.trim();
      }

      if (!bed || typeof bed !== "object") {
        return "";
      }

      const quantity = normalizeMaybeInteger(bed?.quantity);
      const bedSize = String(bed?.bedSize || "").trim();
      const bedType = String(
        bed?.bedType || bed?.type || bed?.name || bed?.description || ""
      ).trim();

      const parts = [];

      if (Number.isFinite(quantity) && quantity > 0) {
        parts.push(String(quantity));
      }

      if (bedSize) {
        parts.push(bedSize);
      }

      if (bedType) {
        parts.push(bedType);
      }

      return parts.join(" ").trim();
    })
    .filter(Boolean);
}

export function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }

      if (item && typeof item === "object") {
        return String(item.name || item.description || item.value || "").trim();
      }

      return "";
    })
    .filter(Boolean);
}

export function dedupeStringArray(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function normalizeRichText(value) {
  return String(value || "").trim();
}

export function normalizeImageUrl(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export function normalizePositiveInteger(value, fallback, minimum) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, Math.floor(parsed));
}

export function normalizeNonNegativeInteger(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.floor(parsed));
}

export function normalizeChildAge(ageValue) {
  if (ageValue === "" || ageValue === null || ageValue === undefined) {
    throw new Error("Please select all child ages.");
  }

  const parsed = Number(ageValue);

  if (!Number.isFinite(parsed)) {
    throw new Error("Invalid child age value.");
  }

  const normalizedAge = Math.floor(parsed);

  if (normalizedAge < 0 || normalizedAge > 17) {
    throw new Error("Child age must be between 0 and 17.");
  }

  return normalizedAge;
}

export function normalizeMaybeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeMaybeInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}
