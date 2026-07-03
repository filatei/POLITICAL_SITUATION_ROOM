export const SEAT_PRICE_NAIRA = 10000;
export const SEAT_PRICE_KOBO = SEAT_PRICE_NAIRA * 100;
export const DEFAULT_FREE_SEATS = 10;

// A "seat" = one agent code. First `freeSeats` are free to trial; the rest are
// ₦1,000 each, one-off per election.
export function seatMath(units: number, agentsPerUnit: number, freeSeats = DEFAULT_FREE_SEATS) {
  const u = Math.max(0, Math.round(Number(units) || 0));
  const a = Math.max(0, Math.round(Number(agentsPerUnit) || 0));
  const seats = u * a;
  const billable = Math.max(0, seats - freeSeats);
  return { units: u, agentsPerUnit: a, seats, freeSeats, billable, naira: billable * SEAT_PRICE_NAIRA, kobo: billable * SEAT_PRICE_KOBO };
}

export function costForSeats(billableSeats: number) {
  const b = Math.max(0, Math.round(billableSeats));
  return { billable: b, naira: b * SEAT_PRICE_NAIRA, kobo: b * SEAT_PRICE_KOBO };
}
