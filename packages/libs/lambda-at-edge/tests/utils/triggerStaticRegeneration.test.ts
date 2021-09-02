import { triggerStaticRegeneration } from "../../src/lib/triggerStaticRegeneration";

describe("triggerStaticRegeneration()", () => {
  const mockSQSClient = jest.fn();
  const mockSendMessageCommand = jest.fn();
  beforeEach(() => {
    mockSQSClient.mockReset();
    jest.mock("@aws-sdk/client-sqs", () => ({
      __esModule: true,
      SQSClient: mockSQSClient,
      SendMessageCommand: mockSendMessageCommand
    }));
  });

  const options = {
    basePath: "",
    request: {
      uri: "index.html",
      origin: {
        s3: {
          region: "us-east-1",
          domainName: `my-bucket.s3.us-east-1.amazonaws.com`
        }
      }
    } as AWSLambda.CloudFrontRequest,
    response: {
      headers: { etag: [{ key: "Etag", value: "123" }] },
      status: "200",
      statusDescription: "ok"
    } as AWSLambda.CloudFrontResponse,
    queueName: "my-bucket.fifo",
    pagePath: "/"
  };

  class RequestThrottledException extends Error {
    code = "RequestThrottled";
  }

  it("should not throttle if no rate limit is thrown", async () => {
    mockSQSClient.mockImplementationOnce(() => ({ send: jest.fn() }));
    const staticRegeneratedResponse = await triggerStaticRegeneration(options);
    expect(staticRegeneratedResponse.throttle).toBe(false);
  });

  it("should throttle if a RequestThrottledException is thrown", async () => {
    mockSendMessageCommand.mockImplementationOnce(() => {
      throw new RequestThrottledException();
    });
    const staticRegeneratedResponse = await triggerStaticRegeneration(options);
    expect(staticRegeneratedResponse.throttle).toBe(true);
  });

  it("should rethrow an unknown error", async () => {
    mockSendMessageCommand.mockImplementationOnce(() => {
      throw new Error("Unknown error");
    });
    await expect(triggerStaticRegeneration(options)).rejects.toEqual(
      new Error("Unknown error")
    );
  });

  it("should reject when corrupt s3 name is passed", async () => {
    await expect(
      triggerStaticRegeneration({
        ...options,
        request: {
          ...options.request,
          origin: {
            ...options.request.origin,
            s3: undefined
          }
        } as AWSLambda.CloudFrontRequest
      })
    ).rejects.toEqual(new Error("Expected bucket name to be defined"));
  });

  it("should reject when no region is passed", async () => {
    await expect(
      triggerStaticRegeneration({
        ...options,
        request: {
          ...options.request,
          origin: {
            ...options.request.origin,
            s3: { ...options.request.origin?.s3, region: "" }
          }
        } as AWSLambda.CloudFrontRequest
      })
    ).rejects.toEqual(new Error("Expected region to be defined"));
  });

  it.each`
    lastModified                  | etag         | expected
    ${"2021-05-05T17:15:04.472Z"} | ${"tag"}     | ${"tag"}
    ${"2021-05-05T17:15:04.472Z"} | ${undefined} | ${"1620234904472"}
  `(
    "should throttle send correct parameters to the queue",
    async ({ lastModified, etag, expected }) => {
      mockSQSClient.mockImplementationOnce(() => ({ send: jest.fn() }));
      const staticRegeneratedResponse = await triggerStaticRegeneration({
        ...options,
        response: {
          ...options.response,
          headers: {
            ["last-modified"]: [{ key: "Last-Modified", value: lastModified }],
            ["etag"]: [{ key: "etag", value: etag }]
          }
        }
      });
      expect(staticRegeneratedResponse.throttle).toBe(false);
      expect(mockSendMessageCommand).toHaveBeenCalledWith({
        QueueUrl: `https://sqs.us-east-1.amazonaws.com/my-bucket.fifo`,
        MessageBody: JSON.stringify({
          region: "us-east-1",
          bucketName: "my-bucket",
          cloudFrontEventRequest: options.request,
          basePath: "",
          pagePath: "/"
        }),
        MessageDeduplicationId: expected,
        MessageGroupId: "eacf331f0ffc35d4b482f1d15a887d3b" // md5 hash of "index.html"
      });
    }
  );
});
