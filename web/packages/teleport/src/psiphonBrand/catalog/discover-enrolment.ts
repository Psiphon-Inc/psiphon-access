/*
 * Psiphon Access
 * Copyright (C) 2026  Psiphon Inc.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Brand catalog leaf: the Discover resource enrolment flow.
 *
 * One authoring child owns this file. Add an entry to `DISCOVER_ENROLMENT_ENTRIES` and
 * remove the matching entry from `DISCOVER_ENROLMENT_BASELINE` in the same commit. The
 * gate raises RATCHET_FAIL when a phrase is in both, and UNKNOWN_PHRASE when a
 * phrase is in neither.
 */

import type { BrandBaselineEntry, BrandPhrase } from '../brandCatalog';

/** Catalog entries for the Discover resource enrolment flow. */
export const DISCOVER_ENROLMENT_ENTRIES: readonly BrandPhrase[] = [
  {
    source:
      ') to pull the public Teleport image and to reach your Teleport cluster.',
    replacement:
      ') to pull the public Teleport image and to reach your Psiphon Access cluster.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'Teleport is the upstream container image name, while the connected running service is Psiphon Access.',
  },
  {
    source:
      '*Only required if your database is configured with a certificate signed by a third-party CA. Adding a copy allows Teleport to trust it.',
    replacement:
      '*Only required if your database is configured with a certificate signed by a third-party CA. Adding a copy allows Psiphon Access to trust it.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: '. Reach out to your Teleport administrator to enable',
    replacement: '. Reach out to your Psiphon Access administrator to enable',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      '. Reach out to your Teleport administrator to request additional permissions.',
    replacement:
      '. Reach out to your Psiphon Access administrator to request additional permissions.',
    count: 2,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: '1. Installing Teleport agent',
    replacement: '1. Installing Psiphon Access agent',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: '1. Installing Teleport agent...',
    replacement: '1. Installing Psiphon Access agent...',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: '2. Waiting for the Teleport agent to come online (1-5 minutes)',
    replacement:
      '2. Waiting for the Psiphon Access agent to come online (1-5 minutes)',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: '2. Waiting for the Teleport agent to come online (1-5 minutes)...',
    replacement:
      '2. Waiting for the Psiphon Access agent to come online (1-5 minutes)...',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'AWS Management Console will launch in another tab. You should see your Teleport user name as a federated login with the selected role in the top-right corner of the AWS Console.',
    replacement:
      'AWS Management Console will launch in another tab. You should see your Psiphon Access user name as a federated login with the selected role in the top-right corner of the AWS Console.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Add teleport-agent chart to your charts repository',
    replacement: 'Add teleport-agent chart to your charts repository',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'The phrase contains the upstream Helm chart identifier teleport-agent, which must remain unchanged so chart installation resolves.',
  },
  {
    source:
      'After running the command above, we&apos;ll automatically detect your new Teleport database service.',
    replacement:
      'After running the command above, we&apos;ll automatically detect your new Psiphon Access database service.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'After running the command above, we&apos;ll automatically detect your new Teleport instance.',
    replacement:
      'After running the command above, we&apos;ll automatically detect your new Psiphon Access instance.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Already have Teleport Connect? Skip to the next step.',
    replacement: 'Already have Teleport Connect? Skip to the next step.',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Connect is the upstream desktop application name, so the display text must remain unchanged.',
  },
  {
    source: 'An identifier name for this new database for Teleport.',
    replacement: 'An identifier name for this new database for Psiphon Access.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Ask your Teleport administrator to update your role with the following:',
    replacement:
      'Ask your Psiphon Access administrator to update your role with the following:',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Configure Teleport Discovery Service',
    replacement: 'Configure Psiphon Access Discovery Service',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Create a teleport.yaml file',
    replacement: 'Create a teleport.yaml file',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The phrase contains the teleport.yaml configuration file name, which must remain unchanged so the instruction names the file the binary reads.',
  },
  {
    source: 'Defaulted to your teleport username',
    replacement: 'Defaulted to your Psiphon Access username',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The lower-case upstream wording describes the signed-in service account, so the replacement uses the Psiphon Access product name.',
  },
  {
    source: 'Deploy Teleport Service',
    replacement: 'Deploy Psiphon Access Service',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Deploy the Teleport Database Service',
    replacement: 'Deploy the Psiphon Access Database Service',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Discovery config defines the setup that enables Teleport to automatically discover and register instances.',
    replacement:
      'Discovery config defines the setup that enables Psiphon Access to automatically discover and register instances.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Download and Install Teleport Connect',
    replacement: 'Download and Install Teleport Connect',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Connect is the upstream desktop application name, so the display text must remain unchanged.',
  },
  {
    source: 'Enable Access to AWS with Teleport Application Access',
    replacement: 'Enable Access to AWS with Psiphon Access Application Access',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Generate a command to automatically configure and install the teleport-agent namespace',
    replacement:
      'Generate a command to automatically configure and install the teleport-agent namespace',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The phrase contains the Kubernetes namespace teleport-agent, which must remain unchanged so the generated command targets the correct namespace.',
  },
  {
    source:
      'Install Teleport Service in your cluster via Helm to easily connect your Kubernetes cluster with Teleport.',
    replacement:
      'Install Psiphon Access Service in your cluster via Helm to easily connect your Kubernetes cluster with Psiphon Access.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Install and configure the Teleport SSH Service',
    replacement: 'Install and configure the Psiphon Access SSH Service',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Instead of storing long-lived static credentials, Teleport will request short-lived credentials from AWS to perform operations automatically.',
    replacement:
      'Instead of storing long-lived static credentials, Psiphon Access will request short-lived credentials from AWS to perform operations automatically.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'List of Kubernetes users and groups you want Teleport users to be able to authenticate as.',
    replacement:
      'List of Kubernetes users and groups you want Psiphon Access users to be able to authenticate as.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Log into your Teleport cluster',
    replacement: 'Log into your Psiphon Access cluster',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Log into your Teleport cluster:',
    replacement: 'Log into your Psiphon Access cluster:',
    count: 2,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Name an IAM role for the Teleport Database Service and generate a configuration command. The generated command will create the role and configure permissions for it in your AWS account.',
    replacement:
      'Name an IAM role for the Psiphon Access Database Service and generate a configuration command. The generated command will create the role and configure permissions for it in your AWS account.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Name shown to Teleport users connecting to the cluster',
    replacement: 'Name shown to Psiphon Access users connecting to the cluster',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Network egress from your Kubernetes cluster to Teleport.',
    replacement:
      'Network egress from your Kubernetes cluster to Psiphon Access.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Note: Ensure that you have no higher-priority md5 authentication rules that will match, otherwise PostgreSQL will offer them first, and the certificate-based Teleport login will fail.',
    replacement:
      'Note: Ensure that you have no higher-priority md5 authentication rules that will match, otherwise PostgreSQL will offer them first, and the certificate-based Psiphon Access login will fail.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'On the host where you will run the Discovery Service, create a systemd service configuration for Teleport, enable the Teleport service, and start Teleport:',
    replacement:
      'On the host where you will run the Discovery Service, create a systemd service configuration for Teleport, enable the Teleport service, and start Teleport:',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The phrase refers to the installed upstream systemd unit teleport, so rebranding it could make the systemd commands that follow unsafe.',
  },
  {
    source:
      'On the host where you will run the Discovery Service, enable and start Teleport:',
    replacement:
      'On the host where you will run the Discovery Service, enable and start Teleport:',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The phrase refers to the installed upstream systemd unit teleport, so rebranding it could make the systemd commands that follow unsafe.',
  },
  {
    source:
      'On the host where you will run the Teleport Database Service, execute the generated command that will install and start Teleport with the appropriate configuration.',
    replacement:
      'On the host where you will run the Psiphon Access Database Service, execute the generated command that will install and start Teleport with the appropriate configuration.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The running service uses the Psiphon Access name, while Teleport remains the upstream binary installed by the generated command.',
  },
  {
    source:
      'Once you’ve downloaded Teleport Connect, run the installer to add it to your computer’s applications.',
    replacement:
      'Once you’ve downloaded Teleport Connect, run the installer to add it to your computer’s applications.',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Connect is the upstream desktop application name, so the display text must remain unchanged.',
  },
  {
    source:
      'Please ask your Teleport administrator to update your role and add the',
    replacement:
      'Please ask your Psiphon Access administrator to update your role and add the',
    count: 3,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Please ask your Teleport administrator to update your role and add the required',
    replacement:
      'Please ask your Psiphon Access administrator to update your role and add the required',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Please ask your Teleport administrator to update your role:',
    replacement:
      'Please ask your Psiphon Access administrator to update your role:',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Redeploy Teleport Service',
    replacement: 'Redeploy Psiphon Access Service',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Resource [${agentMeta.resourceName}] has been successfully added to\n      this Teleport Cluster. ${resourceText}',
    replacement:
      'Resource [${agentMeta.resourceName}] has been successfully added to\n      this Psiphon Access cluster. ${resourceText}',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The replacement preserves both placeholders and uses the Psiphon Access product name with cluster as a common noun.',
  },
  {
    source:
      'Run the command below on the server running your Kubernetes cluster. It may take up to a minute for the Teleport Service to join after running the command.',
    replacement:
      'Run the command below on the server running your Kubernetes cluster. It may take up to a minute for the Psiphon Access Service to join after running the command.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Run the command below on the server your target EKS cluster is at. It may take up to a minute for the Teleport Service to join after running the command.',
    replacement:
      'Run the command below on the server your target EKS cluster is at. It may take up to a minute for the Psiphon Access Service to join after running the command.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      "Run the command below to download Teleport's CA and generate cert/key pair.",
    replacement:
      'Run the command below to download the Psiphon Access CA and generate cert/key pair.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The possessive upstream wording is rewritten so the Psiphon Access CA name reads naturally.',
  },
  {
    source:
      'Run the following command against your Teleport Auth Service and save it in',
    replacement:
      'Run the following command against your Psiphon Access Auth Service and save it in',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'SSH or tsh access to the server running the database, and ability to either SCP files, or run a command to retrieve TLS certificates from the Teleport cluster.',
    replacement:
      'SSH or tsh access to the server running the database, and ability to either SCP files, or run a command to retrieve TLS certificates from the Teleport cluster.',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The phrase contains the tsh binary name, which must remain unchanged because users invoke that binary for access.',
  },
  {
    source:
      "Select ECS security groups to assign to the Fargate service that will be running the Teleport Database Service. If you don't select any security groups, the default one for the VPC will be used.",
    replacement:
      "Select ECS security groups to assign to the Fargate service that will be running the Psiphon Access Database Service. If you don't select any security groups, the default one for the VPC will be used.",
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Select ECS subnets to assign to the Fargate service that will be running the Teleport Database Service. All of the subnets you select must have an outbound internet route and a local route to the database subnets.',
    replacement:
      'Select ECS subnets to assign to the Fargate service that will be running the Psiphon Access Database Service. All of the subnets you select must have an outbound internet route and a local route to the database subnets.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      "Self-hosted databases must be configured with Teleport's certificate authority to be able to verify client certificates. They also need a certificate/key pair that Teleport can verify.",
    replacement:
      'Self-hosted databases must be configured with the Psiphon Access certificate authority to be able to verify client certificates. They also need a certificate/key pair that Psiphon Access can verify.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The possessive upstream wording is rewritten so the Psiphon Access certificate authority name reads naturally.',
  },
  {
    source: 'Set Up Teleport Connect',
    replacement: 'Set Up Teleport Connect',
    count: 2,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Connect is the upstream desktop application name, so the display text must remain unchanged.',
  },
  {
    source: 'Setup Discovery Config for Teleport Discovery Service',
    replacement: 'Setup Discovery Config for Psiphon Access Discovery Service',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Successfully detected your new Teleport database service.',
    replacement:
      'Successfully detected your new Psiphon Access database service.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Successfully detected your new Teleport instance.',
    replacement: 'Successfully detected your new Psiphon Access instance.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Teleport Connect is a native desktop application for browsing and accessing your resources. It can also connect your computer to the cluster as an SSH resource.',
    replacement:
      'Teleport Connect is a native desktop application for browsing and accessing your resources. It can also connect your computer to the cluster as an SSH resource.',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Connect is the upstream desktop application name, so the display text must remain unchanged.',
  },
  {
    source: 'Teleport RBAC',
    replacement: 'Psiphon Access RBAC',
    count: 4,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Teleport Service Namespace',
    replacement: 'Psiphon Access Service Namespace',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Teleport as IDP',
    replacement: 'Psiphon Access as IDP',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Teleport can integrate with most, if not all, of your infrastructure. Search below for resources you want to add.',
    replacement:
      'Psiphon Access can integrate with most, if not all, of your infrastructure. Search below for resources you want to add.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Teleport could not detect your new database in time. Please try again.',
    replacement:
      'Psiphon Access could not detect your new database in time. Please try again.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Teleport is currently deploying a database service',
    replacement: 'Psiphon Access is currently deploying a database service',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Teleport needs AWS IAM permissions to be able to discover and register RDS instances and configure IAM authentications.',
    replacement:
      'Psiphon Access needs AWS IAM permissions to be able to discover and register RDS instances and configure IAM authentications.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Teleport needs a database service to be able to connect to your database. Teleport can configure the permissions required to spin up an ECS Fargate container (2vCPU, 4GB memory) in your Amazon account with the ability to access databases in this region (',
    replacement:
      'Psiphon Access needs a database service to be able to connect to your database. Psiphon Access can configure the permissions required to spin up an ECS Fargate container (2vCPU, 4GB memory) in your Amazon account with the ability to access databases in this region (',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Teleport service installation',
    replacement: 'Psiphon Access service installation',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'Teleport uses AWS IAM authentication to connect to RDS databases.',
    replacement:
      'Psiphon Access uses AWS IAM authentication to connect to RDS databases.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Teleport will automatically retry enrolling these resources in the next discovery scan.',
    replacement:
      'Psiphon Access will automatically retry enrolling these resources in the next discovery scan.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      "Teleport's Kubernetes App Discovery will automatically identify and enroll to Teleport HTTP applications running inside a Kubernetes cluster.",
    replacement:
      'Kubernetes App Discovery in Psiphon Access will automatically identify and enroll HTTP applications running inside a Kubernetes cluster.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The sentence is rewritten to avoid an awkward possessive and to keep the generic HTTP application resource category unbranded.',
  },
  {
    source:
      'The Teleport Discovery Service can connect to Amazon EC2 and automatically discover and enroll EC2 instances.',
    replacement:
      'The Psiphon Access Discovery Service can connect to Amazon EC2 and automatically discover and enroll EC2 instances.',
    count: 2,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'The Teleport Discovery Service can connect to Amazon RDS and automatically discover and enroll RDS instances and clusters.',
    replacement:
      'The Psiphon Access Discovery Service can connect to Amazon RDS and automatically discover and enroll RDS instances and clusters.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'The Teleport Service could not join this Teleport cluster. Check the logs for errors by running',
    replacement:
      'The Psiphon Access Service could not join this Psiphon Access cluster. Check the logs for errors by running',
    count: 3,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'The Teleport agent started by Teleport Connect could not join this Teleport cluster. Check if the Connect My Computer tab in Teleport Connect shows any error messages.',
    replacement:
      'The Psiphon Access agent started by Teleport Connect could not join this Psiphon Access cluster. Check if the Connect My Computer tab in Teleport Connect shows any error messages.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'The running agent and cluster use the Psiphon Access name, while Teleport Connect remains the upstream desktop application name.',
  },
  {
    source:
      'The Teleport database service could not join this Teleport cluster. Check the logs for errors by running',
    replacement:
      'The Psiphon Access database service could not join this Psiphon Access cluster. Check the logs for errors by running',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'The button below will open Teleport Connect. Once you are logged in, Teleport Connect will prompt you to connect your computer.',
    replacement:
      'The button below will open Teleport Connect. Once you are logged in, Teleport Connect will prompt you to connect your computer.',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Connect is the upstream desktop application name, so the display text must remain unchanged.',
  },
  {
    source:
      'The computer you are trying to add has already joined the Teleport cluster before you entered this page. If that&apos;s the case, you can go back to the',
    replacement:
      'The computer you are trying to add has already joined the Psiphon Access cluster before you entered this page. If that&apos;s the case, you can go back to the',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      "The default wildcard label allows this database service to match any database. If you're unsure about how label matching works in Teleport, leave this for now.",
    replacement:
      "The default wildcard label allows this database service to match any database. If you're unsure about how label matching works in Psiphon Access, leave this for now.",
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'This guide configures mTLS between your Teleport proxy and your target database.',
    replacement:
      'This guide configures mTLS between your Psiphon Access proxy and your target database.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'This guide sets up a single server in your Teleport cluster for SSH access. It uses a short-lived, randomly generated',
    replacement:
      'This guide sets up a single server in your Psiphon Access cluster for SSH access. It uses a short-lived, randomly generated',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'This guide uses Helm to install the Teleport agent into a cluster, and by default turns on auto-discovery of all apps in the cluster.',
    replacement:
      'This guide uses Helm to install the Psiphon Access agent into a cluster, and by default turns on auto-discovery of all apps in the cluster.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'This issue will reappear if the underlying problem is not fixed. Teleport will automatically retry enrolling these resources in the next discovery scan.',
    replacement:
      'This issue will reappear if the underlying problem is not fixed. Psiphon Access will automatically retry enrolling these resources in the next discovery scan.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'Use Terraform to connect your AWS, Azure, or GCP accounts to Teleport and automatically discover your resources.',
    replacement:
      'Use Terraform to connect your AWS, Azure, or GCP accounts to Psiphon Access and automatically discover your resources.',
    count: 2,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'You can filter for EC2 instances by their tags. If no tags are added, Teleport will enroll all EC2 instances.',
    replacement:
      'You can filter for EC2 instances by their tags. If no tags are added, Psiphon Access will enroll all EC2 instances.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'You cannot add new resources. Reach out to your Teleport administrator for additional permissions.',
    replacement:
      'You cannot add new resources. Reach out to your Psiphon Access administrator for additional permissions.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'You did not start Connect My Computer in Teleport Connect yet.',
    replacement:
      'You did not start Connect My Computer in Teleport Connect yet.',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Connect is the upstream desktop application name, so the display text must remain unchanged.',
  },
  {
    source: 'Your Teleport Enterprise license does not include',
    replacement: 'Your Teleport Enterprise license does not include',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Enterprise is a real upstream edition name with no Psiphon Access equivalent, so the display text must remain unchanged.',
  },
  {
    source: 'already exists but there are no Teleport agents proxying it',
    replacement:
      'already exists but there are no Psiphon Access agents proxying it',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'cat << EOF > prod-cluster-values.yaml\nroles: ${yamlRoles}\nauthToken: ${data.tokenId}\nproxyAddr: ${data.proxyAddr}\nkubeClusterName: ${data.clusterName}\nlabels:\n    teleport.internal/resource-id: ${data.resourceId}${joinLabelsText}\n${extraYAMLConfig}EOF\n\nhelm install teleport-agent teleport/teleport-kube-agent -f prod-cluster-values.yaml --version ${deployVersion} \\\\\n--create-namespace --namespace ${data.namespace}',
    replacement:
      'cat << EOF > prod-cluster-values.yaml\nroles: ${yamlRoles}\nauthToken: ${data.tokenId}\nproxyAddr: ${data.proxyAddr}\nkubeClusterName: ${data.clusterName}\nlabels:\n    teleport.internal/resource-id: ${data.resourceId}${joinLabelsText}\n${extraYAMLConfig}EOF\n\nhelm install teleport-agent teleport/teleport-kube-agent -f prod-cluster-values.yaml --version ${deployVersion} \\\\\n--create-namespace --namespace ${data.namespace}',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This generated shell command and YAML configuration are copied into a terminal and contain chart names, a file path, config keys, a namespace, and a label prefix that must remain byte-identical.',
  },
  {
    source:
      "curl ${cfg.baseUrl}/${requestUrl}\\\n -d '${requestData}'\\\n -H 'Authorization: Bearer ${token}'\\\n -H 'Content-Type: application/json' -OJ;\\\n tar -xvf teleport_mTLS_${hostname}.tar.gz\n  ",
    replacement:
      "curl ${cfg.baseUrl}/${requestUrl}\\\n -d '${requestData}'\\\n -H 'Authorization: Bearer ${token}'\\\n -H 'Content-Type: application/json' -OJ;\\\n tar -xvf teleport_mTLS_${hostname}.tar.gz\n  ",
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This generated shell command is copied into a terminal and contains the upstream teleport_mTLS archive name, so it must remain byte-identical.',
  },
  {
    source:
      'helm repo add teleport https://charts.releases.teleport.dev && helm repo update',
    replacement:
      'helm repo add teleport https://charts.releases.teleport.dev && helm repo update',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This Helm command is copied into a terminal and contains the upstream repository name and URL, so it must remain byte-identical.',
  },
  {
    source: 'in Teleport Connect.',
    replacement: 'in Teleport Connect.',
    count: 1,
    tier: 'render',
    immutable: true,
    reason:
      'Teleport Connect is the upstream desktop application name, so the display text must remain unchanged.',
  },
  {
    source: 'journalctl -fu teleport',
    replacement: 'journalctl -fu teleport',
    count: 3,
    tier: 'protocol',
    immutable: true,
    reason:
      'This journalctl command names the upstream teleport systemd unit and must remain byte-identical.',
  },
  {
    source: 'kubectl logs -l app=teleport-agent -n',
    replacement: 'kubectl logs -l app=teleport-agent -n',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This kubectl command contains the Kubernetes label app=teleport-agent and must remain byte-identical.',
  },
  {
    source: 'kubectl logs -l app=teleport-kube-agent -n teleport-agent',
    replacement: 'kubectl logs -l app=teleport-kube-agent -n teleport-agent',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This kubectl command contains the chart label app=teleport-kube-agent and the namespace teleport-agent, so it must remain byte-identical.',
  },
  {
    source: 'module from your Terraform configuration will remove Teleport and',
    replacement:
      'module from your Terraform configuration will remove Psiphon Access and',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'resources in Teleport. To remove resources from Teleport, delete them via the Teleport UI or CLI.',
    replacement:
      'resources in Psiphon Access. To remove resources from Psiphon Access, delete them via the Psiphon Access UI or CLI.',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'sudo systemctl enable teleport',
    replacement: 'sudo systemctl enable teleport',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This systemctl command names the upstream teleport systemd unit and must remain byte-identical.',
  },
  {
    source: 'sudo systemctl start teleport',
    replacement: 'sudo systemctl start teleport',
    count: 2,
    tier: 'protocol',
    immutable: true,
    reason:
      'This systemctl command names the upstream teleport systemd unit and must remain byte-identical.',
  },
  {
    source:
      'sudo teleport install systemd -o /etc/systemd/system/teleport.service',
    replacement:
      'sudo teleport install systemd -o /etc/systemd/system/teleport.service',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This command invokes the teleport binary and writes the teleport.service systemd unit path, so it must remain byte-identical.',
  },
  {
    source: 'systemctl status teleport',
    replacement: 'systemctl status teleport',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This systemctl command names the upstream teleport systemd unit and must remain byte-identical.',
  },
  {
    source: 'teleport-agent',
    replacement: 'teleport-agent',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is the default Kubernetes namespace identifier teleport-agent and must remain unchanged.',
  },
  {
    source: 'teleport-kube-agent is already installed on the cluster',
    replacement: 'teleport-kube-agent is already installed on the cluster',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The phrase contains the upstream Helm chart identifier teleport-kube-agent, which must remain unchanged so the installation check stays accurate.',
  },
  {
    source: 'teleport.yaml',
    replacement: 'teleport.yaml',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This is the teleport.yaml configuration file name and must remain unchanged so it continues to name the file the binary reads.',
  },
  {
    source: 'that will install Teleport, start it and join the cluster.',
    replacement: 'that will install Teleport, start it and join the cluster.',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'The install script installs and starts the upstream teleport binary, so the instruction must keep the binary name unchanged.',
  },
  {
    source:
      'that you require, please ask your Teleport administrator to update your role:',
    replacement:
      'that you require, please ask your Psiphon Access administrator to update your role:',
    count: 2,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source: 'the Teleport service installation flow',
    replacement: 'the Psiphon Access service installation flow',
    count: 1,
    tier: 'render',
    immutable: false,
    reason:
      'This user-facing service copy must use the Psiphon Access product name.',
  },
  {
    source:
      'version: v3\nteleport:\n  join_params:\n    token_name: "<YOUR_JOIN_TOKEN_FROM_STEP_1>"\n    method: token\n  proxy_server: "${clusterPublicUrl}"\nauth_service:\n  enabled: off\nproxy_service:\n  enabled: off\nssh_service:\n  enabled: off\ndiscovery_service:\n  enabled: "yes"\n  discovery_group: "${discoveryGroupName}"',
    replacement:
      'version: v3\nteleport:\n  join_params:\n    token_name: "<YOUR_JOIN_TOKEN_FROM_STEP_1>"\n    method: token\n  proxy_server: "${clusterPublicUrl}"\nauth_service:\n  enabled: off\nproxy_service:\n  enabled: off\nssh_service:\n  enabled: off\ndiscovery_service:\n  enabled: "yes"\n  discovery_group: "${discoveryGroupName}"',
    count: 1,
    tier: 'protocol',
    immutable: true,
    reason:
      'This YAML configuration is copied into a file and contains protocol config keys, so it must remain byte-identical.',
  },
];

/**
 * Phrases in this area that reach a user and that no catalog entry covers yet.
 * Measured against the catalog baseline recorded on 2026-08-19 by `brandGate.ts`.
 * The baseline can only shrink (ratchet rule).
 */
export const DISCOVER_ENROLMENT_BASELINE: readonly BrandBaselineEntry[] = [];
