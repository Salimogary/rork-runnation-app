import { type EventSubscription, UnavailabilityError } from "expo-modules-core";
import { useEffect, useId } from "react";

import ExpoKeepAwake from "../node_modules/expo-keep-awake/src/ExpoKeepAwake";
import type { KeepAwakeListener, KeepAwakeOptions } from "../node_modules/expo-keep-awake/src/KeepAwake.types";

export const ExpoKeepAwakeTag = "ExpoKeepAwakeDefaultTag";

export async function isAvailableAsync(): Promise<boolean> {
  if (ExpoKeepAwake.isAvailableAsync) {
    return await ExpoKeepAwake.isAvailableAsync();
  }
  return true;
}

export function useKeepAwake(tag?: string, options?: KeepAwakeOptions): void {
  const defaultTag = useId();
  const tagOrDefault = tag ?? defaultTag;

  useEffect(() => {
    let isMounted = true;

    activateKeepAwakeAsync(tagOrDefault)
      .then(() => {
        if (isMounted && ExpoKeepAwake.addListenerForTag && options?.listener) {
          addListener(tagOrDefault, options.listener);
        }
      })
      .catch((error) => {
        console.warn("[KeepAwake] Unable to activate keep awake:", error instanceof Error ? error.message : error);
      });

    return () => {
      isMounted = false;
      deactivateKeepAwake(tagOrDefault).catch(() => {});
    };
  }, [options?.listener, tagOrDefault]);
}

export function activateKeepAwake(tag: string = ExpoKeepAwakeTag): Promise<void> {
  return activateKeepAwakeAsync(tag);
}

export async function activateKeepAwakeAsync(tag: string = ExpoKeepAwakeTag): Promise<void> {
  await ExpoKeepAwake.activate?.(tag);
}

export async function deactivateKeepAwake(tag: string = ExpoKeepAwakeTag): Promise<void> {
  await ExpoKeepAwake.deactivate?.(tag);
}

export function addListener(
  tagOrListener: string | KeepAwakeListener,
  listener?: KeepAwakeListener
): EventSubscription {
  if (!ExpoKeepAwake.addListenerForTag) {
    throw new UnavailabilityError("ExpoKeepAwake", "addListenerForTag");
  }

  const tag = typeof tagOrListener === "string" ? tagOrListener : ExpoKeepAwakeTag;
  const resolvedListener = typeof tagOrListener === "function" ? tagOrListener : listener;

  return ExpoKeepAwake.addListenerForTag(tag, resolvedListener);
}
