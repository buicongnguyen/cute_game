/** A death or completed journey cannot leave an old cast, paid flight, or ride active. */
export function clearJourney(account){
  account.journeyPaid=false;
  for(const key of ['fishingTicket','flightDust','flightPoint','rideUntil','ridePlanet'])delete account[key];
}
