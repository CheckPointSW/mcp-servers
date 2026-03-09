// Generated tool definitions from swagger.json
// Generated on: 2026-03-08T12:22:57.201Z

import { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface McpToolDefinition extends Required<Pick<Tool, 'name' | 'description' | 'inputSchema'>> {
  pathTemplate: string;
  method: string;
  parameters: any[];
  executionParameters?: any[];
  requestBodyContentType?: string;
  securityRequirements?: any[];
  operationId: string;
  baseUrl?: string;
}

export const toolDefinitionMap: McpToolDefinition[] = [
  {
    "name": "ShowCardInfo",
    "description": "Provide information for the Infinity Cloud Services display card",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "method": "post",
    "pathTemplate": "/insights/v3.0/show-card-info",
    "parameters": [],
    "executionParameters": [],
    "securityRequirements": [],
    "operationId": "ShowCardInfo",
    "baseUrl": ""
  },
  {
    "name": "ShowConfig",
    "description": "Get user configuration and settings for Policy Insights product",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "method": "post",
    "pathTemplate": "/insights/v3.0/show-config",
    "parameters": [],
    "executionParameters": [],
    "securityRequirements": [],
    "operationId": "ShowConfig",
    "baseUrl": ""
  },
  {
    "name": "ShowRulesUidsWithSuggestions",
    "description": "Retrieve rule UIDs that have suggestions for a specific suggestion type using the required layer UID\nEnhanced to show both direct suggestions and inline layer suggestions",
    "inputSchema": {
      "type": "object",
      "properties": {
        "requestBody": {
          "properties": {
            "layer": {
              "type": "string",
              "format": "uuid",
              "description": "Access layer identifier in UUID format",
              "pattern": "^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$"
            },
            "filters": {
              "properties": {
                "states": {
                  "items": {
                    "description": "State of a suggestion - either ACCEPTED or REJECTED",
                    "enum": [
                      "ACCEPTED",
                      "REJECTED"
                    ],
                    "type": "string",
                    "x-enum-varnames": [
                      "ACCEPTED",
                      "REJECTED"
                    ]
                  },
                  "type": "array",
                  "description": "Array of insight state values"
                },
                "user-interaction": {
                  "properties": {
                    "operator": {
                      "description": "Operator for filtering by user-interaction-types",
                      "enum": [
                        "NOT-IN",
                        "IN"
                      ],
                      "type": "string",
                      "x-enum-varnames": [
                        "NOT_IN",
                        "IN"
                      ]
                    },
                    "types": {
                      "items": {
                        "description": "Type of user interaction with an insight",
                        "enum": [
                          "DECIDE_LATER"
                        ],
                        "type": "string",
                        "x-enum-varnames": [
                          "DECIDE_LATER"
                        ]
                      },
                      "type": "array",
                      "description": "Array of user interaction type values"
                    }
                  },
                  "required": [
                    "types"
                  ],
                  "type": "object"
                },
                "security-impact": {
                  "enum": [
                    "HIGH",
                    "MEDIUM_AND_ABOVE",
                    "LOW_AND_ABOVE"
                  ],
                  "type": "string",
                  "x-enum-varnames": [
                    "HIGH",
                    "MEDIUM_AND_ABOVE",
                    "LOW_AND_ABOVE"
                  ],
                  "description": "Minimum security impact threshold to include"
                },
                "confidence-level": {
                  "enum": [
                    "HIGH",
                    "MEDIUM_AND_ABOVE",
                    "LOW_AND_ABOVE"
                  ],
                  "type": "string",
                  "x-enum-varnames": [
                    "HIGH",
                    "MEDIUM_AND_ABOVE",
                    "LOW_AND_ABOVE"
                  ],
                  "description": "Minimum confidence threshold to include"
                },
                "default-filter": {
                  "enum": [
                    "NONE"
                  ],
                  "type": "string",
                  "x-enum-varnames": [
                    "NONE"
                  ],
                  "description": "Ignore default filtering of the system"
                },
                "suggestions-type": {
                  "description": "Type of insight",
                  "enum": [
                    "unused-objects",
                    "tighten-rule",
                    "delete-disabled-rule",
                    "zero-hits-rule"
                  ],
                  "type": "string",
                  "x-enum-varnames": [
                    "UnusedObjects",
                    "TightenRule",
                    "DeleteDisabledRule",
                    "ZeroHitsRule"
                  ]
                }
              },
              "required": [
                "suggestions-type"
              ],
              "type": "object"
            }
          },
          "required": [
            "layer",
            "filters"
          ],
          "type": "object",
          "description": "Parameters for showing rules UIDs with their suggestions"
        }
      },
      "required": [
        "requestBody"
      ]
    },
    "method": "post",
    "pathTemplate": "/insights/v3.0/show-rules-uids-with-suggestions",
    "parameters": [],
    "executionParameters": [],
    "requestBodyContentType": "application/json",
    "securityRequirements": [],
    "operationId": "ShowRulesUidsWithSuggestions",
    "baseUrl": ""
  },
  {
    "name": "ShowState",
    "description": "Shows Policy Insights enabled/disabled status\nAllows the Infinity Cloud Services page to determine current state",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "method": "post",
    "pathTemplate": "/insights/v3.0/show-state",
    "parameters": [],
    "executionParameters": [],
    "securityRequirements": [],
    "operationId": "ShowState",
    "baseUrl": ""
  },
  {
    "name": "ShowSuggestionEngineMetadata",
    "description": "Retrieve next suggestions engine run schedule for each suggestion type",
    "inputSchema": {
      "type": "object",
      "properties": {
        "requestBody": {
          "properties": {
            "filters": {
              "properties": {
                "suggestion-type": {
                  "description": "Type of insight",
                  "enum": [
                    "unused-objects",
                    "tighten-rule",
                    "delete-disabled-rule",
                    "zero-hits-rule"
                  ],
                  "type": "string",
                  "x-enum-varnames": [
                    "UnusedObjects",
                    "TightenRule",
                    "DeleteDisabledRule",
                    "ZeroHitsRule"
                  ]
                }
              },
              "type": "object"
            }
          },
          "type": "object",
          "description": "The JSON request body."
        }
      },
      "required": [
        "requestBody"
      ]
    },
    "method": "post",
    "pathTemplate": "/insights/v3.0/show-suggestion-engine-metadata",
    "parameters": [],
    "executionParameters": [],
    "requestBodyContentType": "application/json",
    "securityRequirements": [],
    "operationId": "ShowSuggestionEngineMetadata",
    "baseUrl": ""
  },
  {
    "name": "ShowSuggestions",
    "description": "Retrieve all suggestions with advanced filtering capabilities.\nIncludes suggestions from all inline layers.\nExcludes rejected/accepted suggestions by default.\n\nRequired Parameters:\n- Must provide either \"layer\" OR \"filters.rules-uids\" OR \"filters.uids\"\n- Cannot retrieve suggestions without specifying at least one of these targeting parameters",
    "inputSchema": {
      "type": "object",
      "properties": {
        "requestBody": {
          "properties": {
            "layer": {
              "type": "string",
              "format": "uuid",
              "description": "Access layer identifier in UUID format",
              "pattern": "^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$"
            },
            "options": {
              "properties": {
                "include-inline-layers": {
                  "type": "boolean",
                  "description": "Whether to include insights on inline layers"
                }
              },
              "type": "object"
            },
            "limit": {
              "type": "number",
              "format": "int32",
              "description": "Maximum number of items to return"
            },
            "offset": {
              "type": "number",
              "format": "int32",
              "description": "Number of items to skip for pagination"
            },
            "filters": {
              "properties": {
                "states": {
                  "items": {
                    "description": "State of a suggestion - either ACCEPTED or REJECTED",
                    "enum": [
                      "ACCEPTED",
                      "REJECTED"
                    ],
                    "type": "string",
                    "x-enum-varnames": [
                      "ACCEPTED",
                      "REJECTED"
                    ]
                  },
                  "type": "array",
                  "description": "Array of insight state values"
                },
                "user-interaction": {
                  "properties": {
                    "operator": {
                      "description": "Operator for filtering by user-interaction-types",
                      "enum": [
                        "NOT-IN",
                        "IN"
                      ],
                      "type": "string",
                      "x-enum-varnames": [
                        "NOT_IN",
                        "IN"
                      ]
                    },
                    "types": {
                      "items": {
                        "description": "Type of user interaction with an insight",
                        "enum": [
                          "DECIDE_LATER"
                        ],
                        "type": "string",
                        "x-enum-varnames": [
                          "DECIDE_LATER"
                        ]
                      },
                      "type": "array",
                      "description": "Array of user interaction type values"
                    }
                  },
                  "required": [
                    "types"
                  ],
                  "type": "object"
                },
                "security-impact": {
                  "enum": [
                    "HIGH",
                    "MEDIUM_AND_ABOVE",
                    "LOW_AND_ABOVE"
                  ],
                  "type": "string",
                  "x-enum-varnames": [
                    "HIGH",
                    "MEDIUM_AND_ABOVE",
                    "LOW_AND_ABOVE"
                  ],
                  "description": "Minimum security impact threshold to include"
                },
                "confidence-level": {
                  "enum": [
                    "HIGH",
                    "MEDIUM_AND_ABOVE",
                    "LOW_AND_ABOVE"
                  ],
                  "type": "string",
                  "x-enum-varnames": [
                    "HIGH",
                    "MEDIUM_AND_ABOVE",
                    "LOW_AND_ABOVE"
                  ],
                  "description": "Minimum confidence threshold to include"
                },
                "default-filter": {
                  "enum": [
                    "NONE"
                  ],
                  "type": "string",
                  "x-enum-varnames": [
                    "NONE"
                  ],
                  "description": "Ignore default filtering of the system"
                },
                "uids": {
                  "items": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Stringified UUID.",
                    "pattern": "^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$"
                  },
                  "type": "array",
                  "description": "Array of insight unique identifiers"
                },
                "rules-uids": {
                  "items": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Stringified UUID.",
                    "pattern": "^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$"
                  },
                  "type": "array",
                  "description": "Array of rule unique identifiers"
                },
                "types": {
                  "items": {
                    "description": "Type of insight",
                    "enum": [
                      "unused-objects",
                      "tighten-rule",
                      "delete-disabled-rule",
                      "zero-hits-rule"
                    ],
                    "type": "string",
                    "x-enum-varnames": [
                      "UnusedObjects",
                      "TightenRule",
                      "DeleteDisabledRule",
                      "ZeroHitsRule"
                    ]
                  },
                  "type": "array",
                  "description": "Type of insight"
                }
              },
              "type": "object"
            }
          },
          "type": "object",
          "description": "Parameters for showing suggestions with enhanced v3.0 capabilities"
        }
      },
      "required": [
        "requestBody"
      ]
    },
    "method": "post",
    "pathTemplate": "/insights/v3.0/show-suggestions",
    "parameters": [],
    "executionParameters": [],
    "requestBodyContentType": "application/json",
    "securityRequirements": [],
    "operationId": "ShowSuggestions",
    "baseUrl": ""
  },
  {
    "name": "ShowSuggestionsInfo",
    "description": "Retrieve detailed information such as last engine run, next run schedule and suggestions status, can be specified by suggestion type.\nProvides onboarding guidance for cases where the system has not yet completed its first analysis and generated its first set of insights,\nor if insights were generated but can't see the suggestions.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "requestBody": {
          "properties": {
            "layer": {
              "type": "string",
              "format": "uuid",
              "description": "Access layer identifier in UUID format",
              "pattern": "^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$"
            }
          },
          "required": [
            "layer"
          ],
          "type": "object",
          "description": "The JSON request body."
        }
      },
      "required": [
        "requestBody"
      ]
    },
    "method": "post",
    "pathTemplate": "/insights/v3.0/show-suggestions-info",
    "parameters": [],
    "executionParameters": [],
    "requestBodyContentType": "application/json",
    "securityRequirements": [],
    "operationId": "ShowSuggestionsInfo",
    "baseUrl": ""
  },
  {
    "name": "ShowSuggestionsSummary",
    "description": "Retrieve number of rule suggestions grouped by their type.\nProvides generation batch metadata about the current suggestions we see: how many days of traffic logs were analyzed, on which publish timestamp the suggestions are based on.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "requestBody": {
          "properties": {
            "layer": {
              "type": "string",
              "format": "uuid",
              "description": "Access layer identifier in UUID format",
              "pattern": "^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$"
            },
            "filters": {
              "properties": {
                "states": {
                  "items": {
                    "description": "State of a suggestion - either ACCEPTED or REJECTED",
                    "enum": [
                      "ACCEPTED",
                      "REJECTED"
                    ],
                    "type": "string",
                    "x-enum-varnames": [
                      "ACCEPTED",
                      "REJECTED"
                    ]
                  },
                  "type": "array",
                  "description": "Array of insight state values"
                },
                "user-interaction": {
                  "properties": {
                    "operator": {
                      "description": "Operator for filtering by user-interaction-types",
                      "enum": [
                        "NOT-IN",
                        "IN"
                      ],
                      "type": "string",
                      "x-enum-varnames": [
                        "NOT_IN",
                        "IN"
                      ]
                    },
                    "types": {
                      "items": {
                        "description": "Type of user interaction with an insight",
                        "enum": [
                          "DECIDE_LATER"
                        ],
                        "type": "string",
                        "x-enum-varnames": [
                          "DECIDE_LATER"
                        ]
                      },
                      "type": "array",
                      "description": "Array of user interaction type values"
                    }
                  },
                  "required": [
                    "types"
                  ],
                  "type": "object"
                },
                "security-impact": {
                  "enum": [
                    "HIGH",
                    "MEDIUM_AND_ABOVE",
                    "LOW_AND_ABOVE"
                  ],
                  "type": "string",
                  "x-enum-varnames": [
                    "HIGH",
                    "MEDIUM_AND_ABOVE",
                    "LOW_AND_ABOVE"
                  ],
                  "description": "Minimum security impact threshold to include"
                },
                "confidence-level": {
                  "enum": [
                    "HIGH",
                    "MEDIUM_AND_ABOVE",
                    "LOW_AND_ABOVE"
                  ],
                  "type": "string",
                  "x-enum-varnames": [
                    "HIGH",
                    "MEDIUM_AND_ABOVE",
                    "LOW_AND_ABOVE"
                  ],
                  "description": "Minimum confidence threshold to include"
                },
                "default-filter": {
                  "enum": [
                    "NONE"
                  ],
                  "type": "string",
                  "x-enum-varnames": [
                    "NONE"
                  ],
                  "description": "Ignore default filtering of the system"
                }
              },
              "type": "object"
            }
          },
          "type": "object",
          "description": "Parameters for showing suggestions summary"
        }
      },
      "required": [
        "requestBody"
      ]
    },
    "method": "post",
    "pathTemplate": "/insights/v3.0/show-suggestions-summary",
    "parameters": [],
    "executionParameters": [],
    "requestBodyContentType": "application/json",
    "securityRequirements": [],
    "operationId": "ShowSuggestionsSummary",
    "baseUrl": ""
  },
  {
    "name": "ShowPolicyInsightsStatus",
    "description": "Shows Policy Insights status, reflecting the overall status of the product including supported API versions.\nReturns both Insights API versions and Threat Prevention Insights API versions when Threat Prevention is enabled.\nMay also include license status information if available.\nA license is required to activate the product, and the status provides details about the validity and expiration of the product license.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "method": "post",
    "pathTemplate": "/show-policy-insights-status",
    "parameters": [],
    "executionParameters": [],
    "securityRequirements": [],
    "operationId": "ShowPolicyInsightsStatus",
    "baseUrl": ""
  }
];

export default toolDefinitionMap;
