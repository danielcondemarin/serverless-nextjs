const { when } = require("jest-when");
const yaml = require("js-yaml");
const fse = require("fs-extra");
const fs = require("fs");
const clone = require("lodash.clonedeep");
const merge = require("lodash.merge");
const addCustomStackResources = require("../addCustomStackResources");
const ServerlessPluginBuilder = require("../../utils/test/ServerlessPluginBuilder");
const getAssetsBucketName = require("../getAssetsBucketName");
const logger = require("../../utils/logger");

jest.mock("../getAssetsBucketName");
jest.mock("fs-extra");
jest.mock("fs");
jest.mock("js-yaml");
jest.mock("../../utils/logger");

describe("addCustomStackResources", () => {
  const bucketName = "bucket-123";
  const bucketUrl = `https://s3.amazonaws.com/${bucketName}`;

  const s3ResourcesYmlString = `
      Resources:
        NextStaticAssetsS3Bucket:...
    `;
  const proxyResourcesYmlString = `
      Resources:
        ProxyResource:...
    `;
  const staticProxyResourcesYmlString = `
      resources:
        Resources:
          StaticAssetsProxyResource:...
    `;

  const nextProxyResourcesYmlString = `
      resources:
        Resources:
          NextStaticAssetsProxyResource:...
    `;

  let s3Resources;
  let baseProxyResource;
  let baseStaticProxyResource;
  let baseNextProxyResource;

  beforeEach(() => {
    s3Resources = {
      Resources: {
        NextStaticAssetsS3Bucket: {
          Properties: {
            BucketName: "TO_BE_REPLACED"
          }
        }
      }
    };

    baseProxyResource = {
      Resources: {
        ProxyResource: {
          Properties: {
            PathPart: "TO_BE_REPLACED"
          }
        },
        ProxyMethod: {
          Properties: {
            Integration: {
              Uri: "TO_BE_REPLACED"
            },
            ResourceId: {
              Ref: "TO_BE_REPLACED"
            }
          }
        }
      }
    };

    baseStaticProxyResource = {
      resources: {
        Resources: {
          StaticAssetsProxyParentResource: {
            Properties: {
              PathPart: "TO_BE_REPLACED"
            }
          },
          StaticAssetsProxyResource: {
            Properties: {
              PathPart: "TO_BE_REPLACED"
            }
          },
          StaticAssetsProxyMethod: {
            Properties: {
              Integration: {
                Uri: "TO_BE_REPLACED"
              },
              ResourceId: {
                Ref: "TO_BE_REPLACED"
              }
            }
          }
        }
      }
    };

    baseNextProxyResource = {
      resources: {
        Resources: {
          NextStaticAssetsProxyParentResource: {
            Properties: {
              PathPart: "TO_BE_REPLACED"
            }
          },
          NextStaticAssetsProxyResource: {
            Properties: {
              PathPart: "TO_BE_REPLACED"
            }
          },
          NextStaticAssetsProxyMethod: {
            Properties: {
              Integration: {
                Uri: "TO_BE_REPLACED"
              },
              ResourceId: {
                Ref: "TO_BE_REPLACED"
              }
            }
          }
        }
      }
    };

    when(fs.readdirSync)
      .calledWith("public")
      .mockImplementation(() => {
        const err = new Error();
        err.code = "ENOENT";
        throw err;
      });

    when(fse.readFile)
      .calledWith(expect.stringContaining("assets-bucket.yml"), "utf-8")
      .mockResolvedValueOnce(s3ResourcesYmlString);

    when(yaml.safeLoad)
      .calledWith(s3ResourcesYmlString, expect.any(Object))
      .mockReturnValueOnce(s3Resources);

    when(fse.readFile)
      .calledWith(expect.stringContaining("api-gw-proxy.yml"), "utf-8")
      .mockResolvedValueOnce(proxyResourcesYmlString);

    when(yaml.safeLoad)
      .calledWith(proxyResourcesYmlString, expect.any(Object))
      .mockReturnValueOnce(baseProxyResource);

    when(fse.readFile)
      .calledWith(expect.stringContaining("api-gw-next.yml"), "utf-8")
      .mockResolvedValueOnce(nextProxyResourcesYmlString);

    when(yaml.safeLoad)
      .calledWith(nextProxyResourcesYmlString, expect.any(Object))
      .mockReturnValueOnce(baseNextProxyResource);

    when(fse.readFile)
      .calledWith(expect.stringContaining("api-gw-static.yml"), "utf-8")
      .mockResolvedValueOnce(staticProxyResourcesYmlString);

    when(yaml.safeLoad)
      .calledWith(staticProxyResourcesYmlString, expect.any(Object))
      .mockReturnValueOnce(baseStaticProxyResource);

    getAssetsBucketName.mockReturnValueOnce(bucketName);
  });

  it("adds S3 bucket to resources", () => {
    expect.assertions(3);

    const coreCfTemplate = {
      Resources: {
        foo: "bar"
      }
    };
    const s3ResourcesWithBucketName = clone(s3Resources);
    s3ResourcesWithBucketName.Resources.NextStaticAssetsS3Bucket.Properties.BucketName = bucketName;

    const plugin = new ServerlessPluginBuilder().build();

    plugin.serverless.service.provider.coreCloudFormationTemplate = clone(
      coreCfTemplate
    );

    return addCustomStackResources.call(plugin).then(() => {
      expect(logger.log).toBeCalledWith(
        expect.stringContaining(`Found bucket "${bucketName}"`)
      );
      expect(
        plugin.serverless.service.resources.Resources.NextStaticAssetsS3Bucket
          .Properties.BucketName
      ).toEqual(bucketName);
      expect(
        plugin.serverless.service.provider.coreCloudFormationTemplate
      ).toEqual(merge(coreCfTemplate, s3ResourcesWithBucketName));
    });
  });

  it("adds static proxy routes for static folder", () => {
    expect.assertions(2);

    const plugin = new ServerlessPluginBuilder().build();

    return addCustomStackResources.call(plugin).then(() => {
      const resources = plugin.serverless.service.resources.Resources;
      expect(Object.keys(resources)).toEqual([
        "NextStaticAssetsS3Bucket",
        "StaticAssetsProxyParentResource",
        "StaticAssetsProxyResource",
        "StaticAssetsProxyMethod",
        "NextStaticAssetsProxyParentResource",
        "NextStaticAssetsProxyResource",
        "NextStaticAssetsProxyMethod"
      ]);
      expect(
        resources.StaticAssetsProxyMethod.Properties.Integration.Uri
      ).toEqual("https://s3.amazonaws.com/bucket-123/static/{proxy}");
    });
  });

  it("adds static proxy routes for nextjs assets", () => {
    expect.assertions(2);

    const plugin = new ServerlessPluginBuilder().build();

    return addCustomStackResources.call(plugin).then(() => {
      const resources = plugin.serverless.service.resources.Resources;
      expect(Object.keys(resources)).toEqual([
        "NextStaticAssetsS3Bucket",
        "StaticAssetsProxyParentResource",
        "StaticAssetsProxyResource",
        "StaticAssetsProxyMethod",
        "NextStaticAssetsProxyParentResource",
        "NextStaticAssetsProxyResource",
        "NextStaticAssetsProxyMethod"
      ]);
      expect(
        resources.NextStaticAssetsProxyMethod.Properties.Integration.Uri
      ).toEqual("https://s3.amazonaws.com/bucket-123/_next/{proxy}");
    });
  });

  it("adds static proxy route to each file in the public folder", () => {
    expect.assertions(8);

    const plugin = new ServerlessPluginBuilder()
      .withPluginConfig({
        publicDir: "public"
      })
      .build();

    when(fs.readdirSync)
      .calledWith("public")
      .mockReturnValueOnce(["foo/bar.js", "bar.js"]);

    return addCustomStackResources.call(plugin).then(() => {
      const {
        FooBarProxyMethod,
        FooBarProxyResource,
        BarProxyMethod,
        BarProxyResource
      } = plugin.serverless.service.resources.Resources;

      expect(FooBarProxyMethod.Properties.Integration.Uri).toEqual(
        `${bucketUrl}/public/foo/bar.js`
      );
      expect(FooBarProxyMethod.Properties.ResourceId.Ref).toEqual(
        "FooBarProxyResource"
      );
      expect(FooBarProxyResource.Properties.PathPart).toEqual("foo/bar.js");
      expect(logger.log).toBeCalledWith(
        `Proxying foo/bar.js -> ${bucketUrl}/public/foo/bar.js`
      );

      expect(BarProxyMethod.Properties.Integration.Uri).toEqual(
        `${bucketUrl}/public/bar.js`
      );
      expect(BarProxyMethod.Properties.ResourceId.Ref).toEqual(
        "BarProxyResource"
      );
      expect(BarProxyResource.Properties.PathPart).toEqual(`bar.js`);
      expect(logger.log).toBeCalledWith(
        `Proxying bar.js -> ${bucketUrl}/public/bar.js`
      );
    });
  });

  it("adds static proxy route to resources with correct bucket url for the region", () => {
    expect.assertions(2);

    const euWestRegion = "eu-west-1";
    const bucketUrlIreland = `https://s3-${euWestRegion}.amazonaws.com/${bucketName}`;
    const getRegion = jest.fn().mockReturnValueOnce(euWestRegion);

    when(fs.readdirSync)
      .calledWith("public")
      .mockReturnValueOnce(["foo/bar.js"]);

    const plugin = new ServerlessPluginBuilder().withPluginConfig().build();

    plugin.provider.getRegion = getRegion;

    return addCustomStackResources.call(plugin).then(() => {
      const {
        FooBarProxyMethod
      } = plugin.serverless.service.resources.Resources;

      expect(getRegion).toBeCalled();
      expect(FooBarProxyMethod.Properties.Integration.Uri).toEqual(
        `${bucketUrlIreland}/public/foo/bar.js`
      );
    });
  });

  it("adds static proxy route to resources with correct bucket url for the public directory", () => {
    expect.assertions(2);

    const euWestRegion = "eu-west-1";
    const bucketUrlIreland = `https://s3-${euWestRegion}.amazonaws.com/${bucketName}`;
    const getRegion = jest.fn().mockReturnValueOnce(euWestRegion);

    const publicDir = "aDifferentPublicDir";

    when(fs.readdirSync)
      .calledWith(`./${publicDir}`)
      .mockReturnValueOnce(["foo/bar.js"]);

    const plugin = new ServerlessPluginBuilder()
      .withPluginConfig({
        publicDir: `./${publicDir}`
      })
      .build();

    plugin.provider.getRegion = getRegion;

    return addCustomStackResources.call(plugin).then(() => {
      const {
        FooBarProxyMethod
      } = plugin.serverless.service.resources.Resources;

      expect(getRegion).toBeCalled();
      expect(FooBarProxyMethod.Properties.Integration.Uri).toEqual(
        `${bucketUrlIreland}/${publicDir}/foo/bar.js`
      );
    });
  });

  describe("When no bucket available", () => {
    beforeEach(() => {
      getAssetsBucketName.mockReset();
      getAssetsBucketName.mockReturnValue(null);
    });

    it("doesn't add S3 bucket to resources", () => {
      expect.assertions(5);

      const plugin = new ServerlessPluginBuilder().build();

      return addCustomStackResources.call(plugin).then(() => {
        expect(logger.log).not.toBeCalled();
        expect(fse.readFile).not.toBeCalled();
        expect(yaml.safeLoad).not.toBeCalled();
        expect(plugin.serverless.service.resources).toEqual(undefined);
        expect(
          plugin.serverless.service.provider.coreCloudFormationTemplate
        ).toEqual(undefined);
      });
    });
  });
});
