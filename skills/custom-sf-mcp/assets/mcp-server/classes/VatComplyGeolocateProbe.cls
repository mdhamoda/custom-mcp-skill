/**
 * Worked example - real, org-confirmed @InvocableMethod wrapping a Custom-type
 * ExternalServiceRegistration's generated ExternalService.* Apex class, reaching MCP as an
 * aa: tool. See references/external-service-registration.md §6.
 *
 * Naming rules confirmed live: an operationId's underscore is translated to "x5f" in both the
 * generated method name (get_geolocate -> getx5fgeolocate()) and response field names
 * (country_code -> countryx5fcode). The operation has no parameters, so no *_Request type
 * exists and the method takes zero arguments.
 */
global with sharing class VatComplyGeolocateProbe {
    global class GeoResult {
        @InvocableVariable public String countryCode;
        @InvocableVariable public String countryName;
        @InvocableVariable public String capital;
        @InvocableVariable public Double latitude;
        @InvocableVariable public Double longitude;
        @InvocableVariable public String ip;
    }

    @InvocableMethod(label='Get IP Geolocation (VatComply Custom-ESR-via-ExternalService probe)')
    global static List<GeoResult> getGeolocation() {
        ExternalService.VatComplyGeolocate service = new ExternalService.VatComplyGeolocate();
        Object rawResponse = service.getx5fgeolocate();
        ExternalService.VatComplyGeolocate.getx5fgeolocate_Response response =
            (ExternalService.VatComplyGeolocate.getx5fgeolocate_Response) rawResponse;

        GeoResult result = new GeoResult();
        result.countryCode = response.Code200.countryx5fcode;
        result.countryName = response.Code200.name;
        result.capital = response.Code200.capital;
        result.latitude = response.Code200.latitude;
        result.longitude = response.Code200.longitude;
        result.ip = response.Code200.ip;
        return new List<GeoResult>{ result };
    }
}
