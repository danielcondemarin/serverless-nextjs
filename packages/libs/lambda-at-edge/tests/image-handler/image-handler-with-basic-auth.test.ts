import { createCloudFrontEvent } from "../test-utils";
import { handler } from "../../src/image-handler";

const mockSend = jest.fn(() => {
  // do nothing
});

const MockS3Client = jest.fn(() => ({
  constructor: () => {
    // do nothing
  },
  send: mockSend
}));

jest.mock("@aws-sdk/client-s3/src/S3Client", () => {
  return {
    S3Client: MockS3Client
  };
});

jest.mock("@aws-sdk/client-s3/src/commands/GetObjectCommand", () =>
  require("../mocks/s3/aws-sdk-s3-client-get-object-command.mock")
);

jest.mock(
  "../../src/manifest.json",
  () => require("./image-build-manifest-with-basic-auth.json"),
  {
    virtual: true
  }
);

jest.mock(
  "../../src/images-manifest.json",
  () => require("./image-images-manifest.json"),
  {
    virtual: true
  }
);

jest.mock(
  "../../src/routes-manifest.json",
  () => require("./image-routes-manifest.json"),
  {
    virtual: true
  }
);

describe("Image lambda handler", () => {
  if (process.version.startsWith("v10")) {
    it("skipping tests for Node.js that is on v10", () => {
      // do nothing
    });
    return;
  }

  describe("Basic Authentication", () => {
    it.each`
      usernamePassword | expectedAuthenticateSuccess
      ${"test:123"}    | ${true}
      ${"test:wrong"}  | ${false}
    `(
      "for $usernamePassword, authenticated successfully: $expectedAuthenticateSuccess",
      async ({ usernamePassword, expectedAuthenticateSuccess }) => {
        const event = createCloudFrontEvent({
          uri: "/_next/image?url=%2Ftest.png&q=100&w=128",
          host: "mydistribution.cloudfront.net",
          requestHeaders: {
            authorization: [
              {
                key: "Authorization",
                value:
                  "Basic " + Buffer.from(usernamePassword).toString("base64")
              }
            ]
          }
        });

        const response = await handler(event);

        if (expectedAuthenticateSuccess) {
          expect(response.status).not.toEqual("401"); // We are only testing whether unauthorized or not.
        } else {
          expect(response).toEqual({
            status: "401",
            statusDescription: "Unauthorized",
            body: "Unauthorized",
            headers: {
              "www-authenticate": [{ key: "WWW-Authenticate", value: "Basic" }]
            }
          });
        }
      }
    );
  });
});
