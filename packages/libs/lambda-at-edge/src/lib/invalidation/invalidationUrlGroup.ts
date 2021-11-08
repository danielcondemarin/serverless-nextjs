// @ts-ignore
import * as _ from "../lodash";

const DEFAULT_INIT_NUMBER = 0;

export type BasicInvalidationUrlGroup = {
  regex: string;
  invalidationPath: string;
  maxAccessNumber: number;
};

export type InvalidationUrlGroup = BasicInvalidationUrlGroup & {
  currentNumber: number;
};

export const getGroupS3Key = (basicGroup: BasicInvalidationUrlGroup) => {
  return "counter";
};

export const basicGroupToJSON = (basicGroup: BasicInvalidationUrlGroup) => {
  console.log("basicGroupToJSON", JSON.stringify(basicGroup));
  return JSON.stringify({ ...basicGroup, currentNumber: DEFAULT_INIT_NUMBER });
};

export function findInvalidationGroup(
  url: string,
  basicGroups: BasicInvalidationUrlGroup[] | undefined
): BasicInvalidationUrlGroup | null {
  console.log("findInvalidationGroup", url);

  if (_.isEmpty(basicGroups)) {
    return null;
  }

  basicGroups?.forEach((group) => {
    console.log("findInvalidationGroup", JSON.stringify(group));

    if (url.match(group.regex)) {
      return group;
    }
  });

  return null;
}
