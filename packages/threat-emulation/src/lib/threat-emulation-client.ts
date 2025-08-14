import axios from 'axios';
import { createReadStream } from 'fs';
import FormData from 'form-data';
import { getHeaderValue } from '@chkp/mcp-utils';


export class ThreatEmulationSettings {
    apiKey?: string;

    constructor({
    apiKey = process.env.API_KEY
  }: {
    apiKey?: string;
  } = {}) {
    this.apiKey = apiKey || '';
  }


  static fromArgs(options: any): ThreatEmulationSettings {
    return new ThreatEmulationSettings({
      apiKey: options.apiKey
    });
  }

  static fromHeaders(headers: Record<string, string | string[]>): ThreatEmulationSettings {
    const apiKey = getHeaderValue(headers, 'API-KEY');
    return new ThreatEmulationSettings({
      apiKey
    });
  }
}

let tokenCached = '';


// Threat Emulation API Client
export class ThreatEmulationClient {
    private settings: ThreatEmulationSettings;
    private readonly BASE_URL = 'https://te-api.checkpoint.com/tecloud/api/v1/file';

    constructor(settings: ThreatEmulationSettings) {
        this.settings = settings;
    }


    /**
     * Upload file for threat analysis
     */
    async uploadFile(filePath: string, fileName: string, features: string[] = ['te', 'av'], hashes?: { md5?: string; sha1?: string; sha256?: string }, reports?: string[]): Promise<any> {
        try {
            const formData = new FormData();
            
            // Prepare request object
            const request: any = {
                file_name: fileName,
                features: features
            };

            // Add hashes if provided
            if (hashes?.md5) request.md5 = hashes.md5;
            if (hashes?.sha1) request.sha1 = hashes.sha1;
            if (hashes?.sha256) request.sha256 = hashes.sha256;

            // Add TE configuration with XML as default report
            if (features.includes('te')) {
                request.te = {
                    reports: reports || ['xml']  // Changed: Default to XML only
                };
            }

            formData.append('request', JSON.stringify({ request }));
            formData.append('file', createReadStream(filePath));

            const response = await axios.post(`${this.BASE_URL}/upload`, formData, {
                headers: {
                    'Authorization': this.settings.apiKey,
                    ...formData.getHeaders()
                }
            });

            return response.data;
        } catch (error: any) {
            console.error('Error uploading file:', error.message);
            throw error;
        }
    }

    /**
     * Query file analysis results
     */
    async queryFile(features: string[] = ['te', 'av'], hashes: { md5?: string; sha1?: string; sha256?: string }, images?: { id: string; revision: number }[], fileName?: string, reports?: string[]): Promise<any> {
        try {
            // Helper function to make the actual request
            const makeQueryRequest = async (requestReports: string[]) => {
                const request: any = {
                    features: features
                };

                // Add file name if provided
                if (fileName) {
                    request.file_name = fileName;
                }

                // Add all provided hashes
                if (hashes.md5) request.md5 = hashes.md5;
                if (hashes.sha1) request.sha1 = hashes.sha1;
                if (hashes.sha256) request.sha256 = hashes.sha256;

                // Validate at least one hash is provided
                if (!hashes.md5 && !hashes.sha1 && !hashes.sha256) {
                    throw new Error('At least one hash (md5, sha1, or sha256) must be provided');
                }

                // Add TE configuration with specified reports
                if (features.includes('te')) {
                    request.te = {
                        reports: requestReports
                    };
                    
                    // Include images if provided
                    if (images && images.length > 0) {
                        request.te.images = images;
                    }
                }

                return await axios.post(`${this.BASE_URL}/query`, {
                    request
                }, {
                    headers: {
                        'Authorization': this.settings.apiKey,
                        'Content-Type': 'application/json'
                    }
                });
            };

            // First try with requested reports
            const requestedReports = reports || ['xml'];
            let response = await makeQueryRequest(requestedReports);
            
            // If PARTIALLY_FOUND, try with different report combinations
            if (response.data.response?.status?.code === 1006) {
                console.error('PARTIALLY_FOUND - trying with xml+summary');
                
                // Try with xml+summary combination
                response = await makeQueryRequest(['xml', 'summary']);
            }


            return response.data;
        } catch (error: any) {
            console.error('Error querying file:', error.message);
            throw error;
        }
    }

    /**
     * Download report by ID
     */
    async downloadReport(reportId: string): Promise<any> {
        try {
            const response = await axios.get(`${this.BASE_URL}/download`, {
                params: { id: reportId },
                headers: {
                    'Authorization': this.settings.apiKey
                },
            });

            return {
                data: response.data,
                contentType: response.headers['content-type'],
                contentLength: response.headers['content-length']
            };
        } catch (error: any) {
            console.error('Error downloading report:', error.message);
            throw error;
        }
    }

    /**
     * Get quota information
     */
    async getQuota(): Promise<any> {
        try {
            const response = await axios.post(`${this.BASE_URL}/quota`, {}, {
                headers: {
                    'Authorization': this.settings.apiKey,
                    'Content-Type': 'application/json'
                }
            });

            return response.data;
        } catch (error: any) {
            console.error('Error getting quota:', error.message);
            throw error;
        }
    }
}
