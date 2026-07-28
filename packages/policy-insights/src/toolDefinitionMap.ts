// Generated tool definitions from swagger.json
// Generated on: 2026-07-28T08:57:47.641Z

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
    "pathTemplate": "/insights/v3.1/show-card-info",
    "parameters": [],
    "executionParameters": [],
    "securityRequirements": [],
    "operationId": "ShowCardInfo",
    "baseUrl": ""
  },
  {
    "name": "ShowConfig",
    "description": "Get user configuration and settings for Policy Insights product\n\nResponse includes all configuration fields with their current value,\nwhether the value is overridden from default, and the default value.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "method": "post",
    "pathTemplate": "/insights/v3.1/show-config",
    "parameters": [],
    "executionParameters": [],
    "securityRequirements": [],
    "operationId": "ShowConfig",
    "baseUrl": ""
  },
  {
    "name": "ShowReportLayers",
    "description": "Retrieve detailed layer information with suggestion counts and security metrics.\nSupports pagination, filtering, and sorting.\n\nResponse includes layer details such as:\n- Security score and total rules\n- Suggestion counts (all and top priority)\n- Associated policy packages\n- Custom icons and colors\n\nSupports text search and ordering by various fields.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "requestBody": {
          "properties": {
            "filters": {
              "properties": {
                "policy-id": {
                  "type": "string",
                  "format": "uuid",
                  "description": "Policy identifier associated with the event",
                  "pattern": "^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$"
                },
                "layer-id": {
                  "type": "string",
                  "format": "uuid",
                  "description": "Layer identifier associated with the event",
                  "pattern": "^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$"
                },
                "text": {
                  "type": "string",
                  "description": "Text string for searching or matching"
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
            "order": {
              "items": {
                "properties": {
                  "ASC": {
                    "type": "string",
                    "description": "Sort order field name for ascending order"
                  },
                  "DESC": {
                    "type": "string",
                    "description": "Sort order field name for descending order"
                  }
                },
                "type": "object"
              },
              "type": "array",
              "description": "Array of order configurations for sorting results"
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
    "pathTemplate": "/insights/v3.1/show-report-layers",
    "parameters": [],
    "executionParameters": [],
    "requestBodyContentType": "application/json",
    "securityRequirements": [],
    "operationId": "ShowReportLayers",
    "baseUrl": ""
  },
  {
    "name": "ShowReportStats",
    "description": "Retrieve global statistics for the entire tenant.\nNo filters required - provides tenant-wide metrics.\n\nResponse includes:\n- Total rules and objects with recent changes\n- Log telemetry coverage (days and count)\n- Reporting server statistics\n- Total traffic logs analyzed\n\nUseful for executive dashboard and health monitoring.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "requestBody": {
          "properties": {},
          "type": "object",
          "description": "The JSON request body."
        }
      },
      "required": [
        "requestBody"
      ]
    },
    "method": "post",
    "pathTemplate": "/insights/v3.1/show-report-stats",
    "parameters": [],
    "executionParameters": [],
    "requestBodyContentType": "application/json",
    "securityRequirements": [],
    "operationId": "ShowReportStats",
    "baseUrl": ""
  },
  {
    "name": "ShowReportSuggestionCategories",
    "description": "Retrieve suggestion categories report showing distribution of suggestions by type over time.\nProvides insights into which types of suggestions are being generated.\n\nResponse includes both 'all' suggestions and 'top' priority suggestions,\nbroken down by category (unused-objects, tighten-rule, etc.) per day.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "requestBody": {
          "properties": {
            "filters": {
              "properties": {
                "policy-id": {
                  "type": "string",
                  "format": "uuid",
                  "description": "Policy identifier associated with the event",
                  "pattern": "^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$"
                },
                "layer-id": {
                  "type": "string",
                  "format": "uuid",
                  "description": "Layer identifier associated with the event",
                  "pattern": "^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$"
                },
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
                },
                "start-date": {
                  "type": "string",
                  "description": "Timestamp when the operation started"
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
    "pathTemplate": "/insights/v3.1/show-report-suggestion-categories",
    "parameters": [],
    "executionParameters": [],
    "requestBodyContentType": "application/json",
    "securityRequirements": [],
    "operationId": "ShowReportSuggestionCategories",
    "baseUrl": ""
  },
  {
    "name": "ShowReportSummary",
    "description": "Retrieve summary statistics for policy insights reporting.\nProvides high-level metrics including top insights, total insights, and security scores.\n\nCan be filtered by policy or layer to show specific scope.\nIncludes count of suggestions marked as 'decide later'.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "requestBody": {
          "properties": {
            "filters": {
              "properties": {
                "policy-id": {
                  "type": "string",
                  "format": "uuid",
                  "description": "Policy identifier associated with the event",
                  "pattern": "^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$"
                },
                "layer-id": {
                  "type": "string",
                  "format": "uuid",
                  "description": "Layer identifier associated with the event",
                  "pattern": "^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$"
                },
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
    "pathTemplate": "/insights/v3.1/show-report-summary",
    "parameters": [],
    "executionParameters": [],
    "requestBodyContentType": "application/json",
    "securityRequirements": [],
    "operationId": "ShowReportSummary",
    "baseUrl": ""
  },
  {
    "name": "ShowReportUserActions",
    "description": "Retrieve user actions report showing accepted and rejected suggestions over time.\nProvides historical data for tracking user engagement with suggestions.\n\nResponse includes daily breakdown of accepted vs rejected suggestions,\nfiltered by policy, layer, suggestion type, and date range.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "requestBody": {
          "properties": {
            "filters": {
              "properties": {
                "policy-id": {
                  "type": "string",
                  "format": "uuid",
                  "description": "Policy identifier associated with the event",
                  "pattern": "^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$"
                },
                "layer-id": {
                  "type": "string",
                  "format": "uuid",
                  "description": "Layer identifier associated with the event",
                  "pattern": "^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$"
                },
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
                },
                "start-date": {
                  "type": "string",
                  "description": "Timestamp when the operation started"
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
    "pathTemplate": "/insights/v3.1/show-report-user-actions",
    "parameters": [],
    "executionParameters": [],
    "requestBodyContentType": "application/json",
    "securityRequirements": [],
    "operationId": "ShowReportUserActions",
    "baseUrl": ""
  },
  {
    "name": "ShowRulesUidsWithSuggestions",
    "description": "Retrieve rule UIDs that have suggestions for a specific suggestion type using the required layer UID.\nEnhanced to show both direct suggestions and inline layer suggestions.\nSupports filtering by suggestion creation time using start-date (ISO 8601 format).",
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
                },
                "start-date": {
                  "type": "string",
                  "description": "Timestamp when the suggestion was created",
                  "format": "date-time"
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
    "pathTemplate": "/insights/v3.1/show-rules-uids-with-suggestions",
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
    "pathTemplate": "/insights/v3.1/show-state",
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
    "pathTemplate": "/insights/v3.1/show-suggestion-engine-metadata",
    "parameters": [],
    "executionParameters": [],
    "requestBodyContentType": "application/json",
    "securityRequirements": [],
    "operationId": "ShowSuggestionEngineMetadata",
    "baseUrl": ""
  },
  {
    "name": "ShowSuggestions",
    "description": "Retrieve all suggestions with advanced filtering capabilities.\nIncludes suggestions from all inline layers.\nExcludes rejected/accepted suggestions by default.\nSupports filtering by suggestion creation time using start-date (ISO 8601 format).\n\nRequired Parameters:\n- Must provide either \"layer\" OR \"filters.rules-uids\" OR \"filters.uids\"\n- Cannot retrieve suggestions without specifying at least one of these targeting parameters",
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
                },
                "start-date": {
                  "type": "string",
                  "description": "Timestamp when the suggestion was created",
                  "format": "date-time"
                }
              },
              "type": "object"
            }
          },
          "type": "object",
          "description": "Parameters for showing suggestions with v3.1 capabilities"
        }
      },
      "required": [
        "requestBody"
      ]
    },
    "method": "post",
    "pathTemplate": "/insights/v3.1/show-suggestions",
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
    "pathTemplate": "/insights/v3.1/show-suggestions-info",
    "parameters": [],
    "executionParameters": [],
    "requestBodyContentType": "application/json",
    "securityRequirements": [],
    "operationId": "ShowSuggestionsInfo",
    "baseUrl": ""
  },
  {
    "name": "ShowSuggestionsSummary",
    "description": "Retrieve number of rule suggestions grouped by their type.\nProvides generation batch metadata about the current suggestions we see: how many days of traffic logs\nwere analyzed, on which publish timestamp the suggestions are based on.\nSupports filtering by suggestion creation time using start-date (ISO 8601 format).",
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
                "start-date": {
                  "type": "string",
                  "description": "Timestamp when the suggestion was created",
                  "format": "date-time"
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
    "pathTemplate": "/insights/v3.1/show-suggestions-summary",
    "parameters": [],
    "executionParameters": [],
    "requestBodyContentType": "application/json",
    "securityRequirements": [],
    "operationId": "ShowSuggestionsSummary",
    "baseUrl": ""
  },
  {
    "name": "ShowPolicyInsightsStatus",
    "description": "Shows Policy Insights status, reflecting the overall status of the product including supported API versions.\nReturns both Insights API versions and Threat Prevention Insights API versions when Threat Prevention is enabled.\nMay also include license status information if available.\nA license is required to activate the product, and the status provides details about the validity and expiration of the product license.\nMay return status messages providing additional context about the product status, such as activation progress.",
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
