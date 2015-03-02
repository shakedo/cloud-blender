underscore = require('underscore'),
a={
   "Deployment": {
      "$": {
         "xmlns": "http://schemas.microsoft.com/windowsazure",
         "xmlns:i": "http://www.w3.org/2001/XMLSchema-instance"
      },
      "Name": [
         "testDelMissTag"
      ],
      "DeploymentSlot": [
         "Production"
      ],
      "PrivateID": [
         "cebd3f6f74b34b638f6ff9f0df8305c6"
      ],
      "Status": [
         "Running"
      ],
      "Label": [
         "dGVzdERlbE1pc3NUYWc="
      ],
      "Url": [
         "http://testdelmisstag.cloudapp.net/"
      ],
      "Configuration": [
         "PFNlcnZpY2VDb25maWd1cmF0aW9uIHhtbG5zOnhzZD0iaHR0cDovL3d3dy53My5vcmcvMjAwMS9YTUxTY2hlbWEiIHhtbG5zOnhzaT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS9YTUxTY2hlbWEtaW5zdGFuY2UiIHhtbG5zPSJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL1NlcnZpY2VIb3N0aW5nLzIwMDgvMTAvU2VydmljZUNvbmZpZ3VyYXRpb24iPg0KICA8Um9sZSBuYW1lPSJ0ZXN0RGVsTWlzc1RhZyI+DQogICAgPEluc3RhbmNlcyBjb3VudD0iMSIgLz4NCiAgPC9Sb2xlPg0KICA8Um9sZSBuYW1lPSJ0ZXN0RGVsTWlzc1RhZzIiPg0KICAgIDxJbnN0YW5jZXMgY291bnQ9IjEiIC8+DQogIDwvUm9sZT4NCjwvU2VydmljZUNvbmZpZ3VyYXRpb24+"
      ],
      "RoleInstanceList": [
         {
            "RoleInstance": [
               {
                  "RoleName": [
                     "testDelMissTag"
                  ],
                  "InstanceName": [
                     "testDelMissTag"
                  ],
                  "InstanceStatus": [
                     "RoleStateUnknown"
                  ],
                  "InstanceUpgradeDomain": [
                     "0"
                  ],
                  "InstanceFaultDomain": [
                     "0"
                  ],
                  "InstanceSize": [
                     "Basic_A0"
                  ],
                  "InstanceStateDetails": [
                     {}
                  ],
                  "IpAddress": [
                     "100.73.180.132"
                  ],
                  "InstanceEndpoints": [
                     {
                        "InstanceEndpoint": [
                           {
                              "Name": [
                                 "SSH"
                              ],
                              "Vip": [
                                 "191.235.178.134"
                              ],
                              "PublicPort": [
                                 "22"
                              ],
                              "LocalPort": [
                                 "22"
                              ],
                              "Protocol": [
                                 "tcp"
                              ]
                           }
                        ]
                     }
                  ],
                  "PowerState": [
                     "Started"
                  ],
                  "HostName": [
                     "testDelMissTag"
                  ],
                  "RemoteAccessCertificateThumbprint": [
                     "9a5ea50e102f9ad7a796ce7464ec4f98"
                  ],
                  "GuestAgentStatus": [
                     {
                        "ProtocolVersion": [
                           "1.0"
                        ],
                        "Timestamp": [
                           "2015-03-02T09:27:14Z"
                        ],
                        "GuestAgentVersion": [
                           "WALinuxAgent-2.0.8"
                        ],
                        "Status": [
                           "Ready"
                        ],
                        "FormattedMessage": [
                           {
                              "Language": [
                                 "en-US"
                              ],
                              "Message": [
                                 "GuestAgent is running and accepting new configurations."
                              ]
                           }
                        ]
                     }
                  ],
                  "ResourceExtensionStatusList": [
                     {}
                  ]
               },
               {
                  "RoleName": [
                     "testDelMissTag2"
                  ],
                  "InstanceName": [
                     "testDelMissTag2"
                  ],
                  "InstanceStatus": [
                     "RoleStateUnknown"
                  ],
                  "InstanceUpgradeDomain": [
                     "0"
                  ],
                  "InstanceFaultDomain": [
                     "0"
                  ],
                  "InstanceSize": [
                     "Basic_A0"
                  ],
                  "InstanceStateDetails": [
                     {}
                  ],
                  "IpAddress": [
                     "100.73.180.58"
                  ],
                  "InstanceEndpoints": [
                     {
                        "InstanceEndpoint": [
                           {
                              "Name": [
                                 "SSH"
                              ],
                              "Vip": [
                                 "191.235.178.134"
                              ],
                              "PublicPort": [
                                 "49745"
                              ],
                              "LocalPort": [
                                 "22"
                              ],
                              "Protocol": [
                                 "tcp"
                              ]
                           }
                        ]
                     }
                  ],
                  "PowerState": [
                     "Starting"
                  ],
                  "GuestAgentStatus": [
                     {
                        "ProtocolVersion": [
                           "1.0"
                        ],
                        "Timestamp": [
                           "2015-03-02T09:27:34Z"
                        ],
                        "GuestAgentVersion": [
                           "Unknown"
                        ],
                        "Status": [
                           "NotReady"
                        ],
                        "FormattedMessage": [
                           {
                              "Language": [
                                 "en-US"
                              ],
                              "Message": [
                                 "Status not available for role testDelMissTag2."
                              ]
                           }
                        ]
                     }
                  ]
               }
            ]
         }
      ],
      "UpgradeDomainCount": [
         "1"
      ],
      "RoleList": [
         {
            "Role": [
               {
                  "$": {
                     "i:type": "PersistentVMRole"
                  },
                  "RoleName": [
                     "testDelMissTag"
                  ],
                  "OsVersion": [
                     {}
                  ],
                  "RoleType": [
                     "PersistentVMRole"
                  ],
                  "ConfigurationSets": [
                     {
                        "ConfigurationSet": [
                           {
                              "$": {
                                 "i:type": "NetworkConfigurationSet"
                              },
                              "ConfigurationSetType": [
                                 "NetworkConfiguration"
                              ],
                              "InputEndpoints": [
                                 {
                                    "InputEndpoint": [
                                       {
                                          "LocalPort": [
                                             "22"
                                          ],
                                          "Name": [
                                             "SSH"
                                          ],
                                          "Port": [
                                             "22"
                                          ],
                                          "Protocol": [
                                             "tcp"
                                          ],
                                          "Vip": [
                                             "191.235.178.134"
                                          ],
                                          "EnableDirectServerReturn": [
                                             "false"
                                          ]
                                       }
                                    ]
                                 }
                              ],
                              "SubnetNames": [
                                 {}
                              ]
                           }
                        ]
                     }
                  ],
                  "ResourceExtensionReferences": [
                     {}
                  ],
                  "DataVirtualHardDisks": [
                     {}
                  ],
                  "OSVirtualHardDisk": [
                     {
                        "HostCaching": [
                           "ReadWrite"
                        ],
                        "DiskName": [
                           "testDelMissTag-testDelMissTag-0-201503020755470200"
                        ],
                        "MediaLink": [
                           "https://portalvhds3wdjf3w2d2cmp.blob.core.windows.net/vhds/testDelMissTag-testDelMissTag-2015-03-02.vhd"
                        ],
                        "SourceImageName": [
                           "b39f27a8b8c64d52b05eac6a62ebad85__Ubuntu-12_04_5-LTS-amd64-server-20150204-en-us-30GB"
                        ],
                        "OS": [
                           "Linux"
                        ]
                     }
                  ],
                  "RoleSize": [
                     "Basic_A0"
                  ],
                  "ProvisionGuestAgent": [
                     "true"
                  ]
               },
               {
                  "$": {
                     "i:type": "PersistentVMRole"
                  },
                  "RoleName": [
                     "testDelMissTag2"
                  ],
                  "OsVersion": [
                     {}
                  ],
                  "RoleType": [
                     "PersistentVMRole"
                  ],
                  "ConfigurationSets": [
                     {
                        "ConfigurationSet": [
                           {
                              "$": {
                                 "i:type": "NetworkConfigurationSet"
                              },
                              "ConfigurationSetType": [
                                 "NetworkConfiguration"
                              ],
                              "InputEndpoints": [
                                 {
                                    "InputEndpoint": [
                                       {
                                          "LocalPort": [
                                             "22"
                                          ],
                                          "Name": [
                                             "SSH"
                                          ],
                                          "Port": [
                                             "49745"
                                          ],
                                          "Protocol": [
                                             "tcp"
                                          ],
                                          "Vip": [
                                             "191.235.178.134"
                                          ],
                                          "EnableDirectServerReturn": [
                                             "false"
                                          ]
                                       }
                                    ]
                                 }
                              ],
                              "SubnetNames": [
                                 {}
                              ]
                           }
                        ]
                     }
                  ],
                  "ResourceExtensionReferences": [
                     {}
                  ],
                  "DataVirtualHardDisks": [
                     {}
                  ],
                  "OSVirtualHardDisk": [
                     {
                        "HostCaching": [
                           "ReadWrite"
                        ],
                        "DiskName": [
                           "testDelMissTag-testDelMissTag2-0-201503020927010781"
                        ],
                        "MediaLink": [
                           "https://portalvhds3wdjf3w2d2cmp.blob.core.windows.net/vhds/testDelMissTag-testDelMissTag2-2015-03-02.vhd"
                        ],
                        "SourceImageName": [
                           "b39f27a8b8c64d52b05eac6a62ebad85__Ubuntu-12_04_5-LTS-amd64-server-20150204-en-us-30GB"
                        ],
                        "OS": [
                           "Linux"
                        ]
                     }
                  ],
                  "RoleSize": [
                     "Basic_A0"
                  ],
                  "ProvisionGuestAgent": [
                     "true"
                  ]
               }
            ]
         }
      ],
      "SdkVersion": [
         {}
      ],
      "Locked": [
         "false"
      ],
      "RollbackAllowed": [
         "false"
      ],
      "CreatedTime": [
         "2015-03-02T07:55:42Z"
      ],
      "LastModifiedTime": [
         "2015-03-02T09:27:33Z"
      ],
      "ExtendedProperties": [
         {}
      ],
      "PersistentVMDowntime": [
         {
            "StartTime": [
               "2015-02-17T00:06:39Z"
            ],
            "EndTime": [
               "2015-02-19T00:06:39Z"
            ],
            "Status": [
               "PersistentVMUpdateScheduled"
            ]
         }
      ],
      "VirtualIPs": [
         {
            "VirtualIP": [
               {
                  "Address": [
                     "191.235.178.134"
                  ],
                  "IsDnsProgrammed": [
                     "true"
                  ],
                  "Name": [
                     "testDelMissTagContractContract"
                  ]
               }
            ]
         }
      ],
      "InternalDnsSuffix": [
         "testDelMissTag.f6.internal.cloudapp.net"
      ],
      "LoadBalancers": [
         {}
      ]
   }
}


console.log(a.Deployment.Name[0])