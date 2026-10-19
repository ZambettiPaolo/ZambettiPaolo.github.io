var setResources = [
  {
    "name":"ALL",
    "holidays":[
      {
        "startDate":"2026-10-26",
        "duration": 11,
        "employed": 100
      }
    ]
  },
  {
    "name":"DESIGNER",
    "holidays":[
      {
        "startDate":"2026-09-14",
        "duration": 5,
        "employed": 100
      },
      {
        "startDate":"2026-11-02",
        "duration": 10,
        "employed": 100
      }
    ]
  },
  {
    "name":"PURCHASING OFFI",
    "holidays":[
      {
      "startDate":"2026-09-28",
      "duration": 10,
      "employed": 100
      }
    ]
  }
]
var meta = {
  "creationDate": "2026-09-01",
  "workingDays": [false, true, true, true, true, true, false]
}
var data = [
  {
    "name": "COFFEE MACHINE",
    "delivery": "2026-12-11",
    "penalty": 2,
    "phases": [
      {
        "name": "DESIGN",
        "duration": 12,
        "uncertainty": 20,
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
        "uncertainty": 4,
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
        "uncertainty": 3,
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
        "uncertainty": 1,
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
        "uncertainty": 1,
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
    "delivery": "2026-12-18",
    "penalty": 8,
    "phases": [
      {
        "name": "DESIGN",
        "duration": 15,
        "uncertainty": 15,
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
        "uncertainty": 5,
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
        "uncertainty": 4,
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
        "uncertainty": 2,
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
        "uncertainty": 1,
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