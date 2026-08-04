import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// R2_ENDPOINT peut contenir le nom du bucket en suffixe (ex: .../udt-photos) — on le retire
// car le bucket est déjà spécifié via le paramètre Bucket du PutObjectCommand.
const rawEndpoint = process.env.R2_ENDPOINT!;
const bucket = process.env.R2_BUCKET ?? 'udt-photos';
const cleanEndpoint = rawEndpoint.replace(new RegExp(`/${bucket}$`), '');

const s3 = new S3Client({
  region: 'auto',
  endpoint: cleanEndpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.R2_BUCKET ?? 'udt-photos';
const PUBLIC_URL = process.env.R2_PUBLIC_URL!;

export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return `${PUBLIC_URL}/${key}`;
}
