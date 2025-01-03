var setResources = [
  {
    "name":"ALL",
    "holidays":[
      {
        "startDate":"2024-12-18",
        "duration": 11,
        "employed": 100
      }
    ]
  },
  {
    "name":"DESIGNER",
    "holidays":[
      {
        "startDate":"2025-01-02",
        "duration": 5,
        "employed": 100
      },
      {
        "startDate":"2025-03-15",
        "duration": 10,
        "employed": 100
      }
    ]
  },
  {
    "name":"PURCHASING OFFI",
    "holidays":[
      {
      "startDate":"2025-04-15",
      "duration": 10,
      "employed": 100
      }
    ]
  }
]
var meta = {
  "creationDate": "2024-12-01"
}
var data = [
  {
    "name": "COFFEE MACHINE",
    "delivery": "2024-11-15",
    "penalty": 2,
    "phases": [
      {
        "name": "DESIGN",
        "duration": 12,
        "start": 0,
        "resources": [
          {
            "name": "DESIGNER",
            "employed": 100
          }
        ]
      },
      {
        "name": "PURCHASE",
        "duration": 22,
        "start": 1,
        "resources": [
          {
            "name": "PURCHASING OFFI",
            "employed": 1
          }
        ]
      },
      {
        "name": "ASSEMBLY",
        "duration": 18,
        "start": 1,
        "resources": [
          {
            "name": "WORKSHOP",
            "employed": 40
          }
        ]
      },
      {
        "name": "CERTIFICATION",
        "duration": 4,
        "start": 1,
        "resources": [
          {
            "name": "DESIGNER",
            "employed": 100
          }
        ]
      },
      {
        "name": "TESTING",
        "duration": 1,
        "start": 1,
        "resources": [
          {
            "name": "DESIGNER",
            "employed": 100
          },
          {
            "name": "CUSTOMER",
            "employed": 10
          },
          {
            "name": "WORKSHOP",
            "employed": 10
          }
        ]
      }
    ]
  },
  {
    "name": "ICE CREAM MACHINE",
    "delivery": "2024-11-28",
    "penalty": 8,
    "phases": [
      {
        "name": "DESIGN",
        "duration": 15,
        "start": 0,
        "resources": [
          {
            "name": "DESIGNER",
            "employed": 100
          }
        ]
      },
      {
        "name": "PURCHASE",
        "duration": 20,
        "start": 1,
        "resources": [
          {
            "name": "PURCHASING OFFI",
            "employed": 1
          }
        ]
      },
      {
        "name": "ASSEMBLY",
        "duration": 20,
        "start": 1,
        "resources": [
          {
            "name": "WORKSHOP",
            "employed": 40
          }
        ]
      },
      {
        "name": "CERTIFICATION",
        "duration": 3,
        "start": 1,
        "resources": [
          {
            "name": "DESIGNER",
            "employed": 100
          }
        ]
      },
      {
        "name": "TESTING",
        "duration": 1,
        "start": 1,
        "resources": [
          {
            "name": "DESIGNER",
            "employed": 100
          },
          {
            "name": "CUSTOMER",
            "employed": 10
          },
          {
            "name": "WORKSHOP",
            "employed": 10
          }
        ]
      }
    ]
  }
]