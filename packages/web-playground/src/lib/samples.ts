/** Starter inputs for the Custom Config Scanner. All names and ARNs are fictional. */

export const SAMPLE_IAM_POLICY = `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EverythingForEveryone",
      "Effect": "Allow",
      "Action": "*",
      "Resource": "*"
    },
    {
      "Sid": "AllBuckets",
      "Effect": "Allow",
      "Action": "s3:*",
      "Resource": "*"
    },
    {
      "Sid": "ReadOneBucket",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::example-archive", "arn:aws:s3:::example-archive/*"]
    },
    {
      "Sid": "NoBucketDeletion",
      "Effect": "Deny",
      "Action": "s3:DeleteBucket",
      "Resource": "*"
    }
  ]
}
`;

export const SAMPLE_TERRAFORM = `# A small, deliberately flawed stack. Every name is fictional.
resource "aws_s3_bucket" "assets" {
  bucket = "crypt-assets-example"
  acl    = "public-read"
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = false
  block_public_policy     = true
  ignore_public_acls      = false
  restrict_public_buckets = true
}

resource "aws_security_group" "bastion" {
  name        = "bastion"
  description = "Jump host"

  ingress {
    description = "ssh from anywhere"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "https"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_ebs_volume" "ledger" {
  availability_zone = "us-east-1a"
  size              = 200
  encrypted         = false
}

resource "aws_iam_policy" "caretaker" {
  name = "caretaker"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = "s3:*", Resource = "*" },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:us-east-1:123456789012:log-group:/crypt/*"
      }
    ]
  })
}
`;

export const SAMPLE_DOCKERFILE = `FROM node:22 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
`;
