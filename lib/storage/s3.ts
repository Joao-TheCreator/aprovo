import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Storage } from "./index";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (STORAGE_DRIVER=s3).`);
  return v;
}

export class S3Storage implements Storage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = required("R2_BUCKET");
    this.client = new S3Client({
      region: "auto",
      endpoint: required("R2_ENDPOINT"),
      forcePathStyle: true,
      credentials: {
        accessKeyId: required("R2_ACCESS_KEY_ID"),
        secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      },
    });
  }

  async putObject(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async getObject(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) return null;
      return {
        body: Buffer.from(await res.Body.transformToByteArray()),
        contentType: res.ContentType ?? "application/octet-stream",
      };
    } catch (e) {
      if (e instanceof Error && (e.name === "NoSuchKey" || e.name === "NotFound")) return null;
      throw e;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async getSignedUrl(key: string, ttlSeconds = 3600): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: ttlSeconds,
    });
  }
}
