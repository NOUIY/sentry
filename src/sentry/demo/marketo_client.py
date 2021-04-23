from django.conf import settings

from sentry import http


def marketo_option(field):
    return settings.DEMO_OTHER_OPTIONS[field]


class MarketoError(Exception):
    def __init__(self, data):
        # just use the first error
        error = data["errors"][0]
        self.code = error["code"]
        self.message = error["message"]

    def __str__(self):
        return f"MarketoError: {self.code} - {self.message}"


class MarketoClient:
    OAUTH_URL = "/identity/oauth/token"
    SUBMIT_FORM_URL = "/rest/v1/leads/submitForm.json"

    def make_request(self, url, *args, **kwargs):
        base_url = marketo_option("MARKETO_BASE_URL")
        full_url = base_url + url
        method = kwargs.pop("method", "GET")
        session = http.build_session()
        resp = getattr(session, method.lower())(full_url, *args, **kwargs)
        resp.raise_for_status()
        return resp.json()

    def make_rest_request(self, url, *args, **kwargs):
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {self.token}"
        headers["Content-Type"] = "application/json"
        data = self.make_request(url, *args, headers=headers, **kwargs)

        if not data.get("success"):
            raise MarketoError(data)

        # not handling field level errors where success=True

        return data

    def retrieve_token(self):
        client_id = marketo_option("MARKETO_CLIENT_ID")
        clint_secret = marketo_option("MARKETO_CLIENT_SECRET")

        url = f"{self.OAUTH_URL}?grant_type=client_credentials&client_id={client_id}&client_secret={clint_secret}"
        return self.make_request(url)

    def submit_form(self, email):
        body = {
            "formId": marketo_option("MARKETO_FORM_ID"),
            "input": [
                {
                    "leadFormFields": {
                        "email": email,
                    },
                }
            ],
        }

        return self.make_rest_request(self.SUBMIT_FORM_URL, method="POST", json=body)

    @property
    def token(self):
        # TODO: store token for re-use
        resp = self.retrieve_token()
        return resp["access_token"]
