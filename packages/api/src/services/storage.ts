import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

let s3: S3Client | null = null;
let BUCKET = '';
let PUBLIC_URL = '';

function getClient(): S3Client {
  if (s3) return s3;

  const rawEndpoint = process.env.R2_ENDPOINT;
  if (!rawEndpoint) throw new Error('R2_ENDPOINT not configured');

  BUCKET = process.env.R2_BUCKET ?? 'udt-photos';
  PUBLIC_URL = process.env.R2_PUBLIC_URL ?? '';
  const cleanEndpoint = rawEndpoint.replace(new RegExp(`/${BUCKET}$`), '');

  s3 = new S3Client({
    region: 'auto',
    endpoint: cleanEndpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  });

  return s3;
}

export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return `${PUBLIC_URL}/${key}`;
}
