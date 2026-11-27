// Qualified detail records. Shared read-only inputs for Test and Plan.
export const evidenceSources = {
  "magnum": {
    "name": "TREMEC Magnum service manual",
    "url": "https://tremec.com/wp-content/uploads/2024/11/Magnum-Service-Manual-Complete.pdf",
    "locator": "Magnum-F specifications, printed pp. 16–17"
  },
  "fordGT350": {
    "name": "2019 Mustang technical specifications",
    "url": "https://media.ford.com/content/dam/fordmedia/North%20America/US/product/2019/mustang/2019-mustang-techspecs.pdf",
    "locator": "Transmission table, Shelby GT350 column"
  },
  "tr3160": {
    "name": "TREMEC TR-3160",
    "url": "https://tremec.com/wp-content/uploads/2023/05/TREMEC_TR-3160_1017.pdf",
    "locator": "Family specification and ratio table"
  },
  "acura": {
    "name": "2001 U.S. Integra Type R specifications",
    "url": "https://acuranews.com/en-US/releases/release-038578562975f17ab17410004c34c8a5-2001-acura-integra-type-r-specifications",
    "locator": "Transmission, chassis and brake tables"
  },
  "gm8": {
    "name": "Chevrolet Performance SuperMatic 8L90 controller guide",
    "url": "https://www.chevrolet.com/content/dam/chevrolet/na/us/english/index/performance/powertrain/performance-parts/installation-guides/01-images/19419038_Supplier.pdf",
    "locator": "Control kit 19419038, 26AP22, English sheets 4 and 5"
  },
  "c8": {
    "name": "Chevrolet Europe Corvette Stingray specifications",
    "url": "https://media.chevrolet.com/content/dam/Media/documents/INTL/chevrolet/tech-data/corvette-stingray/Chevrolet-Corvette-Stingray-TechSpecs_EN.pdf",
    "locator": "M1L dual-clutch, EU Stingray"
  },
  "honda": {
    "name": "Honda 2023 Civic Type R press kit",
    "url": "https://hondanews.com/en-US/honda-automobiles/releases/release-907c81858bdfe231c1cc3d0f70179fdc-2023-honda-civic-type-r-press-kit",
    "locator": "Powertrain, drivetrain and chassis specification tables"
  },
  "mazda": {
    "name": "Mazda USA 2021 MX-5 Miata brochure",
    "url": "https://www.mazdausa.com/siteassets/pdf/brochures/2021/mx-5-miata/2021-mx-5-miata-brochure.pdf",
    "locator": "Engine and gear-ratio table, US"
  },
  "enkei": {
    "name": "Enkei RPF1 technical table",
    "url": "https://enkei.com/wp-content/uploads/2015/01/RPF1.pdf",
    "locator": "17 × 9 rows by suffix; weight N.A. for +35"
  },
  "girodisc": {
    "name": "GiroDisc A1-166 front rotor",
    "url": "https://girodisc.com/honda-fk2-fk8-fl5-civic-type-r-front-rotors/",
    "locator": "Manufacturer product description, listed fitments and approximate unit weight"
  },
  "torsen": {
    "name": "Ford Racing M-4204-MT",
    "url": "https://performanceparts.ford.com/part/M-4204-MT",
    "locator": "Fitment, 34 spline and package fields"
  },
  "ring": {
    "name": "Ford Performance 2020 catalog",
    "url": "https://www-performanceparts.app.ford.com/download/PDFS/2020FPPcatalog.pdf",
    "locator": "Super 8.8 IRS center section and ring/pinion tables"
  },
  "bar": {
    "name": "Ford Racing M-5490-G",
    "url": "https://performanceparts.ford.com/part/M-5490-G",
    "locator": "Fitment, hardware, service and package fields"
  },
  "lt4": {
    "name": "Chevrolet Performance Parts catalog",
    "url": "https://www.chevrolet.com/content/dam/chevrolet/na/us/english/index/performance/order-catalog/Chevrolet_Performance_Catalog.pdf",
    "locator": "LT4 19431955, printed pp. 20–21, dyno chart and package notes"
  },
  "toyota22": {
    "name": "Toyota 2022 GR86 US eBrochure",
    "url": "https://www.toyota.com/content/dam/toyota/brochures/pdf/2022/gr86_ebrochure.pdf",
    "locator": "GR86 specifications, mechanical/performance and brakes"
  },
  "toyotaTrueno": {
    "name": "Toyota 2024 GR86 Performance Package announcement",
    "url": "https://pressroom.toyota.com/2024-gr86-trueno-edition-throwback-spirit-modern-performance/",
    "locator": "Performance Level-Up Acquired"
  },
  "tireRackPS4": {
    "name": "Tire Rack published Pilot Sport 4 specifications",
    "url": "https://www.tirerack.com/tires/Spec.jsp?tireMake=Michelin&tireModel=Pilot+Sport+4",
    "locator": "215/40R18 85Y SL, SKU 14YR8PS4",
    "evidence": "published"
  },
  "fordM9602M": {
    "name": "Ford Performance M-9602-M instructions",
    "url": "https://performanceparts.ford.com/download/instructionsheets/FORDINSTSHTM-9602-M_PDF.PDF",
    "locator": "Spring and stabilizer bar kit with MagneRide calibration"
  },
  "gm10l90": {
    "name": "Chevrolet Performance SuperMatic 10L90 kit instructions",
    "url": "https://www.chevrolet.com/content/dam/chevrolet/na/us/english/index/performance/resources/installation-guides/transmissions/02-pdf/19420481_Supplier_10L90E_Transmission_Kit_for_LT1_LT4_Crate_Engines_V2.pdf",
    "locator": "19420481, sheet 3 of 22, revision 08SE22"
  }
};

export const vehicleEvidenceAdditions = {
  "acura-integra-dc2--2001-type-r-1.8-m5-hatch": {
    "brakes": [
      {
        "key": "rotor_thickness_front",
        "label": "Front rotor thickness",
        "value": 21,
        "unit": "mm",
        "source": "acura",
        "evidence": "manufacturer",
        "note": "Manufacturer nominal rotor thickness. Service wear limits not supplied."
      },
      {
        "key": "rotor_thickness_rear",
        "label": "Rear rotor thickness",
        "value": 9,
        "unit": "mm",
        "source": "acura",
        "evidence": "manufacturer",
        "note": "Manufacturer nominal thickness. Solid disc."
      }
    ],
    "suspension": [
      {
        "key": "front_bar_od",
        "label": "Front stabilizer bar outside diameter",
        "value": 24,
        "unit": "mm",
        "source": "acura",
        "evidence": "manufacturer",
        "note": "Diameter and linkage type do not establish effective roll stiffness."
      },
      {
        "key": "rear_bar_od",
        "label": "Rear stabilizer bar outside diameter",
        "value": 22,
        "unit": "mm",
        "source": "acura",
        "evidence": "manufacturer"
      }
    ]
  },
  "honda-civic-fl5--2023-type-r-k20c1-m6-hatch": {
    "suspension": [
      {
        "key": "front_bar_od",
        "label": "Front stabilizer bar outside diameter",
        "value": 29,
        "unit": "mm",
        "source": "honda",
        "evidence": "manufacturer",
        "note": "Tubular front bar."
      },
      {
        "key": "front_bar_wall",
        "label": "Front stabilizer bar wall",
        "value": 5,
        "unit": "mm",
        "source": "honda",
        "evidence": "manufacturer",
        "note": "Published tubular section; lever arm and measured stiffness unavailable."
      },
      {
        "key": "rear_bar_od",
        "label": "Rear stabilizer bar diameter",
        "value": 20.5,
        "unit": "mm",
        "source": "honda",
        "evidence": "manufacturer",
        "note": "Solid rear bar."
      },
      {
        "key": "damper_design",
        "label": "Dampers",
        "value": "Adaptive",
        "unit": "type",
        "source": "honda",
        "evidence": "manufacturer",
        "note": "Damping curves unavailable."
      }
    ],
    "transmission": [
      {
        "key": "flywheel_design",
        "label": "Factory flywheel",
        "value": "Lightweight single-mass",
        "unit": "type",
        "source": "honda",
        "evidence": "manufacturer",
        "note": "Diameter and weight not documented here."
      },
      {
        "key": "gear_reverse",
        "label": "Reverse ratio",
        "value": 3.757,
        "unit": ":1",
        "source": "honda",
        "evidence": "manufacturer"
      }
    ]
  },
  "toyota-gr86-zn8--2022-premium-2.4-m6-coupe": {
    "transmission": [
      {
        "key": "reverse_ratio",
        "label": "Reverse gear ratio",
        "value": 3.438,
        "unit": "ratio",
        "note": "",
        "evidence": "manufacturer",
        "source": "toyota22"
      },
      {
        "key": "model_code",
        "label": "Manual transmission model code",
        "value": "TL70",
        "unit": "label",
        "note": "",
        "evidence": "manufacturer",
        "source": "toyota22"
      }
    ],
    "brakes": [
      {
        "key": "caliper_front",
        "label": "Front caliper",
        "value": "Floating steel, 2 pistons",
        "unit": "label",
        "note": "",
        "evidence": "manufacturer",
        "source": "toyota22"
      },
      {
        "key": "caliper_rear",
        "label": "Rear caliper",
        "value": "Floating steel, 1 piston",
        "unit": "label",
        "note": "",
        "evidence": "manufacturer",
        "source": "toyota22"
      }
    ],
    "suspension": [
      {
        "key": "stabilizer_bar_od_front",
        "label": "Front stabilizer bar diameter",
        "value": 18,
        "unit": "mm",
        "note": "",
        "evidence": "manufacturer",
        "source": "toyota22"
      },
      {
        "key": "stabilizer_bar_od_rear",
        "label": "Rear stabilizer bar diameter",
        "value": 15,
        "unit": "mm",
        "note": "",
        "evidence": "manufacturer",
        "source": "toyota22"
      },
      {
        "key": "stabilizer_arm_mount",
        "label": "Rear stabilizer mounting",
        "value": "Rear suspension member",
        "unit": "label",
        "note": "",
        "evidence": "manufacturer",
        "source": "toyota22"
      },
      {
        "key": "knuckle_material_front",
        "label": "Front knuckle construction",
        "value": "Iron",
        "unit": "label",
        "note": "",
        "evidence": "manufacturer",
        "source": "toyota22"
      }
    ]
  }
};

export const componentExamples = [
  {
    "id": "chevrolet-lt4-19431955",
    "name": "Chevrolet LT4 19431955",
    "group": "engine",
    "source": "lt4",
    "application": "Crate engine, distinct from a named factory donor",
    "eligibility": "reference",
    "facts": [
      [
        "Architecture",
        "Gen V 6.2 L V8, supercharged"
      ],
      [
        "Output",
        "650 hp at 6,400 rpm"
      ],
      [
        "Torque",
        "650 lb-ft at 3,600 rpm"
      ],
      [
        "Curve",
        "Manufacturer dyno chart linked. No digitized model points."
      ],
      [
        "Dependencies",
        "Applicable control package and installation requirements from the catalog. No certified swap fitment."
      ],
      [
        "Weight",
        "Installed assembly not qualified."
      ]
    ],
    "fields": {
      "displacement_l": {
        "value": 6.2,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      },
      "hp": {
        "value": 650,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      },
      "hp_rpm": {
        "value": 6400,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      },
      "torque_lb_ft": {
        "value": 650,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      },
      "torque_rpm": {
        "value": 3600,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      }
    }
  },
  {
    "id": "ford-m4204mt",
    "name": "Ford Super 8.8 Torsen differential M-4204-MT",
    "group": "axle",
    "source": "torsen",
    "application": "Manufacturer fit notes cover specific 2015–2026 Mustang configurations and gears. Verify housing and ratio.",
    "eligibility": "reference",
    "facts": [
      [
        "Assembly",
        "Differential carrier, separate from complete axle or IRS center assembly"
      ],
      [
        "Architecture",
        "Torsen T2R, torque sensing"
      ],
      [
        "Axle interface",
        "34 spline"
      ],
      [
        "Supported gear ratios",
        "3.31, 3.55, 3.73, 4.09 per part listing"
      ],
      [
        "Package weight",
        "27.1 lb shipping package only"
      ],
      [
        "Torque bias",
        "Numerical bias ratio unavailable."
      ]
    ],
    "fields": {
      "axle_spline_count": {
        "value": 34,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      },
      "package_lb": {
        "value": 27.1,
        "evidence": "manufacturer",
        "boundary": "shipping-package"
      }
    }
  },
  {
    "id": "ford-m420988373a",
    "name": "Ford Super 8.8 ring and pinion M-4209-88373A",
    "group": "axle",
    "source": "ring",
    "application": "2015–2018 Super 8.8 IRS center section application in 2020 catalog",
    "eligibility": "reference",
    "facts": [
      [
        "Assembly",
        "Ring and pinion set"
      ],
      [
        "Ring diameter",
        "8.8 in"
      ],
      [
        "Ratio",
        "3.73"
      ],
      [
        "Dependencies",
        "Install kit M-4210-B3; verify differential and calibration. Check 3.15 carrier exclusions in source."
      ],
      [
        "Weight",
        "Assembly or installed weight unavailable."
      ]
    ],
    "fields": {
      "ring_in": {
        "value": 8.8,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      },
      "ratio": {
        "value": 3.73,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      }
    }
  },
  {
    "id": "enkei-3797906522sp",
    "name": "Enkei RPF1 3797906522SP",
    "group": "tires",
    "source": "enkei",
    "application": "Exact wheel SKU, no vehicle application assigned",
    "eligibility": "reference",
    "facts": [
      [
        "Wheel size",
        "17 × 9 in"
      ],
      [
        "Offset",
        "+22 mm"
      ],
      [
        "Bolt circle",
        "5 × 114.3 mm"
      ],
      [
        "Center bore",
        "73 mm"
      ],
      [
        "Catalog wheel-only weight",
        "16.35 lb"
      ],
      [
        "Dependencies",
        "Check center bore, bolt pattern, load rating, barrel/spoke brake clearance and tire envelope. No tire mass or inertia."
      ]
    ],
    "fields": {
      "wheel_diameter_in": {
        "value": 17,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      },
      "wheel_width_in": {
        "value": 9,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      },
      "offset_mm": {
        "value": 22,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      },
      "center_bore_mm": {
        "value": 73,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      },
      "wheel_only_lb": {
        "value": 16.35,
        "evidence": "manufacturer",
        "boundary": "bare-wheel"
      }
    }
  },
  {
    "id": "enkei-3797906535sp",
    "name": "Enkei RPF1 3797906535SP",
    "group": "tires",
    "source": "enkei",
    "application": "Exact wheel SKU, no vehicle application assigned",
    "eligibility": "reference",
    "facts": [
      [
        "Wheel size",
        "17 × 9 in"
      ],
      [
        "Offset",
        "+35 mm"
      ],
      [
        "Bolt circle",
        "5 × 114.3 mm"
      ],
      [
        "Center bore",
        "73 mm"
      ],
      [
        "Catalog wheel-only weight",
        "Unpublished for this part"
      ],
      [
        "Dependencies",
        "Check center bore, bolt pattern, load rating, barrel/spoke brake clearance and tire envelope. No tire mass or inertia."
      ]
    ],
    "fields": {
      "wheel_diameter_in": {
        "value": 17,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      },
      "wheel_width_in": {
        "value": 9,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      },
      "offset_mm": {
        "value": 35,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      },
      "center_bore_mm": {
        "value": 73,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      }
    }
  },
  {
    "id": "enkei-3797906545sp",
    "name": "Enkei RPF1 3797906545SP",
    "group": "tires",
    "source": "enkei",
    "application": "Exact wheel SKU, no vehicle application assigned",
    "eligibility": "reference",
    "facts": [
      [
        "Wheel size",
        "17 × 9 in"
      ],
      [
        "Offset",
        "+45 mm"
      ],
      [
        "Bolt circle",
        "5 × 114.3 mm"
      ],
      [
        "Center bore",
        "73 mm"
      ],
      [
        "Catalog wheel-only weight",
        "15.65 lb"
      ],
      [
        "Dependencies",
        "Check center bore, bolt pattern, load rating, barrel/spoke brake clearance and tire envelope. No tire mass or inertia."
      ]
    ],
    "fields": {
      "wheel_diameter_in": {
        "value": 17,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      },
      "wheel_width_in": {
        "value": 9,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      },
      "offset_mm": {
        "value": 45,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      },
      "center_bore_mm": {
        "value": 73,
        "evidence": "manufacturer",
        "boundary": "exact-catalog-variant"
      },
      "wheel_only_lb": {
        "value": 15.65,
        "evidence": "manufacturer",
        "boundary": "bare-wheel"
      }
    }
  },
  {
    "id": "girodisc-a1-166",
    "name": "GiroDisc A1-166 front rotor",
    "group": "brakes",
    "source": "girodisc",
    "application": "Maker lists Civic Type R FK2/FK8/FL5 and OE-caliper use. Verify exact application.",
    "eligibility": "reference",
    "facts": [
      [
        "Assembly",
        "Two-piece front rotor, separately from caliper and pad"
      ],
      [
        "Maker’s approximate rotor unit figure",
        "21.1 lb"
      ],
      [
        "Maker’s comparative stock figure",
        "24.6 lb; specific stock assembly boundary and trim should be verified"
      ],
      [
        "Thermal boundary",
        "No heat capacity, effective friction radius or validated change in stopping distance supplied."
      ]
    ],
    "fields": {
      "vendor_approx_front_rotor_lb": {
        "value": 21.1,
        "evidence": "manufacturer",
        "boundary": "vendor-approx-rotor"
      }
    }
  },
  {
    "id": "ford-m5490g",
    "name": "Ford Mustang track stabilizer kit M-5490-G",
    "group": "suspension",
    "source": "bar",
    "application": "Maker lists 2015–26 GT/EcoBoost and 2015–20 GT350/GT350R with stated damper compatibility",
    "eligibility": "reference",
    "facts": [
      [
        "Assembly",
        "Stabilizer kit with hardware and bushings"
      ],
      [
        "Package weight",
        "44 lb shipping package only"
      ],
      [
        "Dependencies",
        "Check the manufacturer application and mounting guidance"
      ],
      [
        "Rate and dimensions",
        "Effective wheel stiffness and installed mass unavailable."
      ]
    ],
    "fields": {
      "package_lb": {
        "value": 44,
        "evidence": "manufacturer",
        "boundary": "shipping-package"
      }
    }
  },
  {
    "id": "gr86-performance-package-2024",
    "name": "Toyota GR86 Performance Package",
    "group": "brakes",
    "source": "toyotaTrueno",
    "application": "Toyota identifies the package as standard on 2024 TRUENO and a dealer-installed option back to 2022 with 18-inch wheels. Verify wheel and parts compatibility.",
    "eligibility": "reference",
    "facts": [
      [
        "Front brake package",
        "4-piston Brembo calipers with 12.8 × 1.3 in rotors"
      ],
      [
        "Rear brake package",
        "2-piston Brembo calipers with 12.4 × 0.79 in rotors"
      ],
      [
        "Dampers",
        "ZF SACHS, high-pressure nitrogen and oil"
      ],
      [
        "Dependencies",
        "Confirm exact wheel clearance, parts and dealer package eligibility. Rotor and caliper mass are unavailable."
      ]
    ],
    "fields": {
      "front_rotor_diameter": {
        "value": 12.8,
        "unit": "in",
        "boundary": "front-rotor",
        "evidence": "manufacturer"
      },
      "front_rotor_thickness": {
        "value": 1.3,
        "unit": "in",
        "boundary": "front-rotor",
        "evidence": "manufacturer"
      },
      "rear_rotor_diameter": {
        "value": 12.4,
        "unit": "in",
        "boundary": "rear-rotor",
        "evidence": "manufacturer"
      },
      "rear_rotor_thickness": {
        "value": 0.79,
        "unit": "in",
        "boundary": "rear-rotor",
        "evidence": "manufacturer"
      },
      "front_caliper_pistons": {
        "value": 4,
        "unit": "count",
        "boundary": "front-caliper",
        "evidence": "manufacturer"
      },
      "rear_caliper_pistons": {
        "value": 2,
        "unit": "count",
        "boundary": "rear-caliper",
        "evidence": "manufacturer"
      },
      "front_pad_area": {
        "value": 11.6,
        "unit": "in²",
        "boundary": "manufacturer-front-pad-area",
        "evidence": "manufacturer"
      },
      "rear_pad_area": {
        "value": 4.9,
        "unit": "in²",
        "boundary": "manufacturer-rear-pad-area",
        "evidence": "manufacturer"
      }
    }
  },
  {
    "id": "michelin-ps4-215-40r18-85y",
    "name": "Michelin Pilot Sport 4 · 215/40R18 85Y SL",
    "group": "tires",
    "source": "tireRackPS4",
    "application": "Exact Tire Rack specification and SKU, the published nominal size and model match the GR86 Premium. Verify the individual OE marking before using this as a factory mass.",
    "eligibility": "reference",
    "facts": [
      [
        "Construction and class",
        "Standard load 85Y max-performance summer tire"
      ],
      [
        "Listed mass",
        "20 lb per unmounted tire"
      ],
      [
        "Catalog dimensions",
        "24.8 in overall diameter; 7–8.5 in rim range; 7.5 in measuring rim"
      ],
      [
        "Rolling figure",
        "840 rev/mile; approximately 75.43 in/rev calculated from that value"
      ],
      [
        "Limits",
        "Catalog rolling circumference is not a measured static loaded radius. No traction coefficient is inferred."
      ]
    ],
    "fields": {
      "tire_weight": {
        "value": 20,
        "unit": "lb",
        "boundary": "one-tire",
        "evidence": "published"
      },
      "outside_diameter": {
        "value": 24.8,
        "unit": "in",
        "boundary": "catalog-overall-diameter",
        "evidence": "published"
      },
      "rev_per_mile": {
        "value": 840,
        "unit": "rev/mi",
        "boundary": "catalog-rolling-spec",
        "evidence": "published"
      },
      "max_load": {
        "value": 1135,
        "unit": "lb",
        "boundary": "rated-load-per-tire",
        "evidence": "published"
      },
      "rolling_circumference": {
        "value": 75.43,
        "unit": "in/rev",
        "boundary": "derived-from-catalog-revs-per-mile",
        "evidence": "calculated"
      }
    }
  },
  {
    "id": "ford-m9602m",
    "name": "Ford Performance MagneRide Handling Pack M-9602-M",
    "group": "suspension",
    "source": "fordM9602M",
    "application": "Maker instructions specify 2018 and later Mustang with MagneRide; confirm current part applicability and calibration. Selected application link is a planning lead.",
    "eligibility": "reference",
    "facts": [
      [
        "Kit scope",
        "Front/rear springs and stabilizer bars plus calibration changes in the Vehicle Dynamics Module"
      ],
      [
        "Dependencies",
        "Confirm MagneRide and part applicability. Manufacturer instructions call for Pro Cal access and compatible software for the calibration."
      ],
      [
        "Limits",
        "No installed-package mass, verified wheel rate or geometry fixture."
      ]
    ],
    "fields": {
      "magneRideCalibration": {
        "value": true,
        "evidence": "manufacturer",
        "boundary": "kit-required-software"
      }
    }
  }
];

export const referenceExampleLinks = {
  "ford-mustang-s550--2018-gt-pp2-5.0-m6-fastback": [
    "ford-m4204mt",
    "ford-m420988373a",
    "ford-m5490g",
    "ford-m9602m"
  ],
  "honda-civic-fl5--2023-type-r-k20c1-m6-hatch": [
    "girodisc-a1-166"
  ],
  "chevrolet-camaro-6th-gen--2017-zl1-lt4-a10-coupe": [
    "chevrolet-lt4-19431955"
  ],
  "toyota-gr86-zn8--2022-premium-2.4-m6-coupe": [
    "gr86-performance-package-2024",
    "michelin-ps4-215-40r18-85y"
  ]
};
