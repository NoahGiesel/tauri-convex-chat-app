/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiUsage from "../aiUsage.js";
import type * as ask from "../ask.js";
import type * as auth from "../auth.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as espn from "../espn.js";
import type * as footballLeagues from "../footballLeagues.js";
import type * as footballMatches from "../footballMatches.js";
import type * as footballSearch from "../footballSearch.js";
import type * as footballStandings from "../footballStandings.js";
import type * as footballTeamSchedules from "../footballTeamSchedules.js";
import type * as footballTeams from "../footballTeams.js";
import type * as friends from "../friends.js";
import type * as gameRules from "../gameRules.js";
import type * as games from "../games.js";
import type * as geoCities from "../geoCities.js";
import type * as geoDuels from "../geoDuels.js";
import type * as geoPhoto from "../geoPhoto.js";
import type * as geoPhotos from "../geoPhotos.js";
import type * as geoPlaces from "../geoPlaces.js";
import type * as geoRules from "../geoRules.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as library from "../library.js";
import type * as linkRules from "../linkRules.js";
import type * as media from "../media.js";
import type * as mediaRules from "../mediaRules.js";
import type * as messages from "../messages.js";
import type * as model from "../model.js";
import type * as pins from "../pins.js";
import type * as previews from "../previews.js";
import type * as quizRules from "../quizRules.js";
import type * as quizzes from "../quizzes.js";
import type * as r2 from "../r2.js";
import type * as rateLimits from "../rateLimits.js";
import type * as reactions from "../reactions.js";
import type * as sidebar from "../sidebar.js";
import type * as summary from "../summary.js";
import type * as summaryPrompt from "../summaryPrompt.js";
import type * as summaryRules from "../summaryRules.js";
import type * as teamPins from "../teamPins.js";
import type * as typing from "../typing.js";
import type * as users from "../users.js";
import type * as wordleDuels from "../wordleDuels.js";
import type * as wordleLists from "../wordleLists.js";
import type * as wordleRules from "../wordleRules.js";
import type * as wordleWords from "../wordleWords.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiUsage: typeof aiUsage;
  ask: typeof ask;
  auth: typeof auth;
  conversations: typeof conversations;
  crons: typeof crons;
  espn: typeof espn;
  footballLeagues: typeof footballLeagues;
  footballMatches: typeof footballMatches;
  footballSearch: typeof footballSearch;
  footballStandings: typeof footballStandings;
  footballTeamSchedules: typeof footballTeamSchedules;
  footballTeams: typeof footballTeams;
  friends: typeof friends;
  gameRules: typeof gameRules;
  games: typeof games;
  geoCities: typeof geoCities;
  geoDuels: typeof geoDuels;
  geoPhoto: typeof geoPhoto;
  geoPhotos: typeof geoPhotos;
  geoPlaces: typeof geoPlaces;
  geoRules: typeof geoRules;
  http: typeof http;
  invites: typeof invites;
  library: typeof library;
  linkRules: typeof linkRules;
  media: typeof media;
  mediaRules: typeof mediaRules;
  messages: typeof messages;
  model: typeof model;
  pins: typeof pins;
  previews: typeof previews;
  quizRules: typeof quizRules;
  quizzes: typeof quizzes;
  r2: typeof r2;
  rateLimits: typeof rateLimits;
  reactions: typeof reactions;
  sidebar: typeof sidebar;
  summary: typeof summary;
  summaryPrompt: typeof summaryPrompt;
  summaryRules: typeof summaryRules;
  teamPins: typeof teamPins;
  typing: typeof typing;
  users: typeof users;
  wordleDuels: typeof wordleDuels;
  wordleLists: typeof wordleLists;
  wordleRules: typeof wordleRules;
  wordleWords: typeof wordleWords;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
