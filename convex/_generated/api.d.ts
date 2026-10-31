/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as conversations from "../conversations.js";
import type * as friends from "../friends.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as media from "../media.js";
import type * as mediaRules from "../mediaRules.js";
import type * as messages from "../messages.js";
import type * as model from "../model.js";
import type * as r2 from "../r2.js";
import type * as reactions from "../reactions.js";
import type * as sidebar from "../sidebar.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  conversations: typeof conversations;
  friends: typeof friends;
  http: typeof http;
  invites: typeof invites;
  media: typeof media;
  mediaRules: typeof mediaRules;
  messages: typeof messages;
  model: typeof model;
  r2: typeof r2;
  reactions: typeof reactions;
  sidebar: typeof sidebar;
  users: typeof users;
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
};
