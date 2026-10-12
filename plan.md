**# URL Shortener with Analytics**

**## Final Requirements and Implementation Plan**



**---**



**# 1. Project Overview**



Build a simple URL shortener with basic click analytics.



Anyone can submit a long URL and receive a shortened

URL without creating an account.



The application will:



1\. Generate unique short URLs.

2\. Reuse existing active short URLs.

3\. Renew TTL when an existing URL is submitted again.

4\. Generate new short codes for expired URLs.

5\. Redirect visitors to original URLs.

6\. Record basic click analytics.

7\. Display analytics in a React frontend.

8\. Store everything in SQLite.



No authentication, caching, or external services

are required.



**---**



**# 2. Technology Stack**



**## Frontend**



\- React

\- Vite

\- JavaScript (JSX)

\- CSS

\- Fetch API

\- React Router



**## Backend**



\- Node.js 22+

\- TypeScript

\- NestJS (Express HTTP adapter)

\- class-validator and class-transformer

\- better-sqlite3 (direct SQLite queries)

\- Node.js crypto

\- @nestjs/swagger (for /docs)



**## Database**



\- SQLite

\- Single database file

\- No ORM required

\- No Redis or caching



**## Testing**



\- Jest for NestJS backend tests

\- @nestjs/testing and Supertest for backend API tests

\- Vitest for basic frontend tests



**---**



**# 3. System Architecture**



           Browser

              |

              v

       React + Vite

       (Port 9011)

              |

              | HTTP / JSON

              v

          NestJS

         (Port 9010)

              |

              | SQL Queries

              v

            SQLite





The React application handles presentation and

user interactions.



NestJS handles all application business logic.



SQLite is the only persistent data store.



The frontend must never access SQLite directly.



During development, Vite shall proxy /api requests

to NestJS to avoid unnecessary CORS configuration.



Shortened redirect URLs must point directly to

NestJS, not the Vite development server.



**---**



**# 4. Finalized Business Rules**



**## BR-01: No Authentication**



\- No login.

\- No signup.

\- No user accounts.

\- No sessions.

\- All features are publicly accessible.



**## BR-02: One Active Short Code Per Original URL**



A given original URL can have only one active

shortened URL at a time.



If an active record already exists, return it.



Do not generate a duplicate short code.



**## BR-03: TTL Renewal**



Every newly created shortened URL receives a

24-hour TTL.



When the same original URL is submitted while its

existing shortened URL is still active:



\- Return the existing short code.

\- Keep the original creation timestamp.

\- Reset expires_at to current time + 24 hours.

\- Update last_submitted_at.

\- Preserve all existing analytics.

\- Do not create a new database record.



Example:



October 12, 10:00 AM:

User submits https\://example.com/page



Short code: Ab3xY9z

Expiry: October 13, 10:00 AM



October 12, 6:00 PM:

Another user submits the same URL.



Short code: Ab3xY9z

New expiry: October 13, 6:00 PM



No new short code is generated.



Note:



The URL can remain active longer than 24 hours

if it is repeatedly submitted before expiration.



Only shortening submissions renew TTL.



Clicks and analytics requests do not renew TTL.



**## BR-04: Expired URL Recreation**



If the previous short URL has expired:



\- Generate a new short code.

\- Create a new database record.

\- Set a new 24-hour TTL.

\- Start analytics at zero.

\- Do not reactivate the old short code.



Old records remain stored but inactive.



**## BR-05: Public Analytics**



Anyone with a valid short code can view

its aggregate analytics.



No authentication is required.



**## BR-06: URL Comparison**



Before database lookup:



\- Remove leading and trailing whitespace.

\- Validate the HTTP or HTTPS URL.

\- Preserve the remaining URL representation.



Two URLs are considered identical only when

their stored strings match.



Query parameter order and URL representation

are not normalized.



**---**



**# 5. Functional Requirements**



**## FR-01: Landing Page**



Route:



GET /



The landing page shall contain:



\- Application name

\- Short description

\- URL input field

\- Shorten URL button

\- Result section

\- Copy button

\- Analytics navigation button

\- Expiration information



The page shall be responsive.



**---**



**## FR-02: URL Submission**



Endpoint:



POST /api/shorten



Request:



{

  "url": "https\://example.com/article"

}



Validation:



\- URL is required.

\- Only HTTP and HTTPS are accepted.

\- A valid hostname is required.

\- Maximum URL length: 2048 characters.

\- Empty URLs are rejected.

\- Invalid URLs return HTTP 422.

\- Configure NestJS validation to return 422 rather

  than its default 400 for invalid URLs.



The backend must not fetch the destination URL.



**---**



**## FR-03: URL Shortening**



When receiving a valid URL:



1\. Begin a SQLite write transaction.

2\. Search for an active matching URL.

3\. If found, renew its expiration.

4\. If not found, generate a unique short code.

5\. Insert a new record if necessary.

6\. Commit the transaction.

7\. Return the shortened URL.



Short codes shall:



\- Contain 7 characters.

\- Use letters and numbers.

\- Be generated using Node.js crypto.

\- Be globally unique.

\- Never reuse previously issued codes.



Example:



Original URL:

https\://example.com/article



Short code:

Ab3xY9z



Short URL:

http\://localhost:9010/r/Ab3xY9z



**---**



**## FR-04: Shortening API Response**



**### New URL**



HTTP 201 Created



{

  "short_code": "Ab3xY9z",

  "short_url": "http\://localhost:9010/r/Ab3xY9z",

  "original_url": "https\://example.com/article",

  "created_at": "2026-10-12T10:00:00Z",

  "expires_at": "2026-10-13T10:00:00Z",

  "reused": false

}



**### Existing Active URL**



HTTP 200 OK



{

  "short_code": "Ab3xY9z",

  "short_url": "http\://localhost:9010/r/Ab3xY9z",

  "original_url": "https\://example.com/article",

  "created_at": "2026-10-12T10:00:00Z",

  "expires_at": "2026-10-13T18:00:00Z",

  "reused": true

}



The response must contain the renewed

expiration timestamp.



**---**



**## FR-05: Redirect**



Endpoint:



GET /r/{short_code}



Process:



1\. Find the short code in SQLite.

2\. Return 404 if it does not exist.

3\. Check expiration.

4\. Return 410 if expired.

5\. Record a click if active.

6\. Redirect to original URL.



Success:



HTTP 302 Found



Redirects shall not renew expiration.



Only successful GET redirect responses count

as clicks.



**---**



**## FR-06: Expiration**



Expiration shall use UTC timestamps.



For new URLs:



expires_at = now + 24 hours



For active duplicate submissions:



expires_at = now + 24 hours



A URL expires when:



current_time >= expires_at



Expired redirects return:



HTTP 410 Gone



{

  "detail": "This shortened URL has expired"

}



Expired URLs cannot be reactivated.



An expired URL may be submitted again to

create a new short code.



Physical deletion is not required.



**---**



**## FR-07: Click Tracking**



Every successful redirect shall:



1\. Increment total_clicks.

2\. Update last_clicked_at.

3\. Insert a click event.



Analytics shall include:



\- Total clicks

\- Last clicked timestamp

\- Creation timestamp

\- Expiration timestamp

\- Hourly click activity



Repeated visits count separately.



No unique visitor detection is required.



No IP addresses or browser fingerprints

shall be stored.



**---**



**## FR-08: Analytics API**



Endpoint:



GET /api/links/{short_code}/analytics



Response:



{

  "short_code": "Ab3xY9z",

  "original_url": "https\://example.com/article",

  "short_url": "http\://localhost:9010/r/Ab3xY9z",

  "created_at": "2026-10-12T10:00:00Z",

  "expires_at": "2026-10-13T18:00:00Z",

  "total_clicks": 15,

  "last_clicked_at": "2026-10-12T14:30:00Z",

  "clicks_by_hour": [

    {

      "hour": "2026-10-12T13:00:00Z",

      "clicks": 5

    },

    {

      "hour": "2026-10-12T14:00:00Z",

      "clicks": 10

    }

  ]

}



The hourly series shall contain 24 UTC

hour buckets, including the current hour

and the preceding 23 hours.



Hours with no clicks shall contain zero.



Total clicks shall represent all clicks on

the active short code since creation,

including clicks before TTL renewals.



Analytics requests do not extend TTL.



Expired short codes return HTTP 410.



Missing codes return HTTP 404.



**---**



**## FR-09: React Analytics Page**



Frontend route:



/stats/:shortCode



The page shall display:



\- Original URL

\- Shortened URL

\- Total clicks

\- Created at

\- Expires at

\- Last clicked at

\- Clicks over time



The chart may be implemented using

simple React components and CSS.



No complex charting library is required.



Provide a Refresh button.



Automatic polling is not required.



**---**



**## FR-10: Copy URL**



The frontend shall provide a Copy button.



When clicked:



\- Copy the short URL to clipboard.

\- Display a success notification.

\- Do not reload the page.



**---**



**## FR-11: Frontend State Handling**



The application shall handle:



\- Empty input

\- Invalid URLs

\- Loading state

\- Successful shortening

\- Reused URLs

\- Network failures

\- Missing analytics

\- Expired analytics

\- Copy failures



API calls shall be performed using Fetch API.



Do not introduce Redux or other state

management libraries.



React local state is sufficient.



**---**



**# 6. Database Design**



Database file:



data/shortener.db



**## 6.1 links Table**



\| Column | Type | Constraints |

\|--------|------|-------------|

\| id | INTEGER | PRIMARY KEY |

\| original_url | TEXT | NOT NULL |

\| short_code | TEXT | UNIQUE, NOT NULL |

\| created_at | TEXT | NOT NULL |

\| last_submitted_at | TEXT | NOT NULL |

\| expires_at | TEXT | NOT NULL |

\| total_clicks | INTEGER | DEFAULT 0 |

\| last_clicked_at | TEXT | NULL |



Important:



original_url must not have a global UNIQUE constraint.



The same original URL may have multiple historical

records, but only one active record.



Required indexes:



\- UNIQUE(short_code)

\- INDEX(original_url, expires_at)



**## 6.2 click_events Table**



\| Column | Type | Constraints |

\|--------|------|-------------|

\| id | INTEGER | PRIMARY KEY |

\| link_id | INTEGER | FOREIGN KEY |

\| clicked_at | TEXT | NOT NULL |



Relationship:



links (1) ---- (N) click_events



Required index:



\- INDEX(link_id, clicked_at)



SQLite foreign keys must be enabled.



All timestamps must use a consistent UTC format.



**---**



**# 7. API Endpoints**



\| Method | Endpoint | Purpose |

\|--------|----------|---------|

\| POST | /api/shorten | Create/reuse URL |

\| GET | /r/{code} | Redirect |

\| GET | /api/links/{code}/analytics | Analytics |

\| GET | /health | Health check |



Frontend routes:



\| Route | Purpose |

\|-------|---------|

\| / | Landing page |

\| /stats/:shortCode | Analytics page |



NestJS Swagger documentation (using @nestjs/swagger):



/docs



**---**



**# 8. Error Handling**



\| Condition | HTTP Status |

\|-----------|-------------|

\| New URL created | 201 |

\| Existing URL renewed | 200 |

\| Successful redirect | 302 |

\| Invalid URL | 422 |

\| Unknown short code | 404 |

\| Expired short code | 410 |

\| Internal server error | 500 |



Error responses shall use clear messages.



NestJS exception handling must preserve the documented

HTTP status codes and error response bodies.



Do not expose internal exceptions or database

implementation details.



**---**



**# 9. Concurrency Requirements**



**## NFR-01: Duplicate URL Concurrency**



Two simultaneous requests for the same new URL

must return the same short code.



The implementation shall use SQLite transactions

to serialize duplicate checks and inserts.



Use BEGIN IMMEDIATE for shortening operations.



The active record lookup and write must happen

inside the same transaction.



**## NFR-02: TTL Renewal Concurrency**



If multiple requests renew the same active URL,

they must not accidentally shorten its expiration.



The transaction must use a consistent current

timestamp and ensure the record remains active

when the renewal is applied.



Concurrent renewal requests shall preserve:



\- The same short code

\- A single active record

\- Existing analytics

\- Correct expiration



**## NFR-03: Click Concurrency**



Concurrent redirect requests must not lose counts.



Use an atomic SQL increment:



UPDATE links

SET total_clicks = total_clicks + 1

WHERE id = ?;



The click-event insert and count update must

occur in one transaction.



**## NFR-04: SQLite Setup**



\- Enable WAL mode.

\- Configure busy timeout.

\- Enable foreign keys.

\- Keep transactions short.

\- Close connections properly.

\- Do not share unsafe SQLite connection objects

  across concurrent requests.



**---**



**# 10. Non-Functional Requirements**



**## Performance**



Targets for local MVP:



\- URL shortening: normally under 500 ms.

\- Redirect processing: normally under 200 ms.

\- Analytics retrieval: normally under 500 ms.



Performance targets are not production SLAs.



**## Reliability**



\- Database transactions must be atomic.

\- Short-code collisions must be handled.

\- State must survive application restarts.

\- No incomplete records after failed operations.



**## Security**



\- Only HTTP/HTTPS destination URLs allowed.

\- Parameterized SQL queries required.

\- No raw SQL string concatenation with user input.

\- No JavaScript URL schemes.

\- No destination URL fetching.

\- No personal information collection.

\- Validate short-code format.

\- No internal error exposure.



Because this is a public URL shortener, phishing

and spam abuse remain possible.



Rate limiting and abuse detection are outside

the one-day MVP.



Public production deployment is not approved

without additional security controls.



**## Simplicity**



Do not introduce:



\- Redis

\- BullMQ

\- Kafka

\- Docker orchestration

\- Microservices

\- Authentication

\- Background workers

\- External analytics services

\- Distributed caching



**---**



**# 11. Frontend Pages**



**## Page 1: Landing Page**



**------------------------------------------------**

               URL SHORTENER

**------------------------------------------------**



Turn long URLs into short, shareable links.



[ Enter long URL                        ]



              [ Shorten URL ]



**------------------------------------------------**



Your Short URL:



http\://localhost:9010/r/Ab3xY9z



[ Copy Link ]     [ View Analytics ]



Expires in: 23 hours 59 minutes



**------------------------------------------------**



Requirements:



\- Simple design

\- Responsive layout

\- Clear loading indicators

\- Input validation

\- Inline success/error feedback

\- Display the current renewed expiration



**## Page 2: Analytics**



**------------------------------------------------**

               LINK ANALYTICS

**------------------------------------------------**



Short URL:

http\://localhost:9010/r/Ab3xY9z



Original URL:

https\://example.com/article



Total Clicks: 15



Created At: 12 Oct 2026

Expires At: 13 Oct 2026

Last Clicked At: 12 Oct 2026



Click Activity:



13:00 | █████       5

14:00 | ██████████  10



                [ Refresh ]



**------------------------------------------------**



Dates must be displayed in the browser's

local timezone.



**---**



**# 13. Development Configuration**



**## Backend**



Default URL:



http\://localhost:9010



Configure NestJS to listen on port 9010.



Configuration:



PUBLIC_BASE_URL=http\://localhost:9010

DATABASE_PATH=../data/shortener.db



**## Frontend**



Default URL:



http\://localhost:9011



Vite shall proxy:



/api -> http\://localhost:9010



The /r/{code} links returned by NestJS must

use PUBLIC_BASE_URL.



The React application must create analytics

navigation URLs using its own frontend origin.



Example:



http\://localhost:9011/stats/Ab3xY9z



Do not accidentally direct users to

http\://localhost:9010/stats/Ab3xY9z

during development.



For the MVP, the application will run as

two development processes.



A production build integration is optional.



**---**



**# 16. Out of Scope**



The following features are excluded:



1\. Login and signup

2\. Authentication

3\. Custom short codes

4\. Custom domains

5\. QR codes

6\. Link editing

7\. Link deletion

8\. Geographic analytics

9\. Device analytics

10\. Unique visitor analytics

11\. Redis caching

12\. Redis TTL

13\. Background cleanup jobs

14\. Scheduled tasks

15\. Rate limiting

16\. WebSockets

17\. Real-time analytics streaming

18\. Link previews

19\. Advanced dashboards

20\. External analytics providers



**---**



**# 18. Definition of Done**



The MVP is complete when a user can:



1\. Open the React landing page.

2\. Submit a URL.

3\. Receive a shortened URL.

4\. Copy and share the URL.

5\. Visit the shortened URL.

6\. Be redirected to the original destination.

7\. Open the analytics page.

8\. View total clicks and hourly activity.

9\. Submit the same URL again.

10\. Receive the same short code with renewed TTL.

11\. Observe that analytics are preserved.

12\. Allow a link to expire.

13\. Confirm the expired code no longer works.

14\. Submit the expired original URL again.

15\. Receive a completely new short code.



The application must use React, Vite, NestJS,

and SQLite only, without authentication or caching.