import { Implementation as ServerInfo } from '@modelcontextprotocol/sdk/types.js';

export function getServerInfo(): Partial<ServerInfo> & { description: string } {
    return {
        description: '"Policy Insights analyzes Access Control policies and network traffic to identify opportunities for optimization. It examines traffic patterns and policy configurations, and suggests modifications to improve your security posture.\\\\n\\\\n## Key Benefits\\\\n- Reduces attack surface by making rules more restrictive and eliminating unnecessary traffic permissions\\\\n- Simplifies access control policies for easier management and auditing. Policy Insights automatically generates intelligent insights to streamline network security. It helps narrow down allowed traffic, remove unused objects and rules, and reduce potential threats, simplifying policy management."',
        websiteUrl: 'https://support.checkpoint.com/results/sk/sk183313',
    };
}
