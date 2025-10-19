import axios, { AxiosInstance } from 'axios';
import { ExternalUserTokenManager } from '@chkp/quantum-infra';
import { DocumentationToolSettings } from './settings';

type DocumentationToolAPIResponse = {
    response: string;
};

export class DocumentationToolAPIManager {
    private tokenService: ExternalUserTokenManager;
    private axios: AxiosInstance;
    private settings: DocumentationToolSettings;

    constructor(settings: DocumentationToolSettings) {
        this.settings = settings;
        this.tokenService = new ExternalUserTokenManager(settings);
        this.axios = axios.create({
            timeout: 30000,
            validateStatus: () => true,
        });
    }

    /**
     * Create a new DocumentationToolAPIManager instance from settings for Documentation Tool
     * @param settings The complete settings object for this session
     * @returns A new DocumentationToolAPIManager instance
     */
    static create(
        settings: DocumentationToolSettings
    ): DocumentationToolAPIManager {
        return new DocumentationToolAPIManager(settings);
    }

    /**
     * Get a valid auth token using the shared token service
     */
    async getToken(): Promise<string> {
        return await this.tokenService.getToken();
    }

    /**
     * Get the base URL for API calls, handling local development if needed
     */
    getBaseUrl(): string {
        if (this.settings.region === 'LOCAL') {
            return `http://localhost:${this.settings.devPort || '8006'}`;
        }
        return `${this.settings.getCloudInfraGateway()}/app/console-one`;
    }

    async callApi(
        method: string,
        uri: string,
        data: { question: string; product: string }
    ): Promise<DocumentationToolAPIResponse> {
        const token = await this.getToken();
        const chatUrl = `${this.getBaseUrl()}/${uri}`;

        const question = data.question;
        const product = data.product;

        const headers = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        };

        const params: {
            question: string;
            product: string;
            uuid?: string;
            skip_llm: boolean;
        } = {
            question: question,
            product: product,
            skip_llm: true,
        };

        try {
            const response = await this.axios.post(chatUrl, params, {
                headers,
            });

            if (response.status !== 200) {
                // Log the error response body
                console.error(
                    'Error response body:',
                    JSON.stringify(response.data, null, 2)
                );
                throw new Error(
                    `Chat request failed: ${response.statusText} (${response.status})`
                );
            }

            return {
                response: response.data.response,
            };
        } catch (error: unknown) {
            // Log any axios exceptions
            const axiosError = error as {
                message: string;
                response?: {
                    status: number;
                    headers: Record<string, unknown>;
                    data: unknown;
                };
            };
            console.error('Axios error:', axiosError.message);
            if (axiosError.response) {
                console.error('Error status:', axiosError.response.status);
                console.error(
                    'Error headers:',
                    JSON.stringify(axiosError.response.headers, null, 2)
                );
                console.error(
                    'Error data:',
                    JSON.stringify(axiosError.response.data, null, 2)
                );
            }
            throw error;
        }
    }
}
