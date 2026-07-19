import { bootEnv } from '../config/bootConfig.js';
import type { GuaranteeTemplate, PublicAgreementTemplate } from '../types/onboarding.js';
import { NotFoundError } from '../utils/customErrors.js';
import { requestJson } from '../utils/http.js';
import { serviceHeaders } from '../utils/serviceAuthentication.js';

const sourceName = 'CS169L-Sp26';
const pocGuarantees = new Set([
    'CORRELATION_INPROGRESSISSUES_NEWBRANCH',
    'CORRELATION_APPROVEDMERGEDPULLREQUEST_TOTALMERGEDPULLREQUEST_TEAM',
]);

const asProofOfConcept = (template: PublicAgreementTemplate): PublicAgreementTemplate => ({
    ...template,
    name: `${template.name}-github-poc`,
    displayName: `${template.displayName} — GitHub POC`,
    description: 'Four-metric GitHub onboarding proof of concept.',
    guarantees: template.guarantees.filter((guarantee) =>
        pocGuarantees.has(guarantee.guaranteeTemplateName),
    ),
});

export const listPublic = async () => {
    const templates = await requestJson<PublicAgreementTemplate[]>(
        `${bootEnv.REGISTRY_SERVICE_URL}/api/v1/agreementTemplates/public`,
        { headers: serviceHeaders() },
    );
    const source = templates.find((template) => template.name === sourceName);
    if (!source) return [];
    const template = asProofOfConcept(source);
    return template.guarantees.length === pocGuarantees.size ? [template] : [];
};

export const getPublic = async (id: string) => {
    const template = (await listPublic()).find((candidate) => candidate._id === id);
    if (!template) throw new NotFoundError('Public agreement template not found');
    return template;
};

export const listGuaranteeTemplates = async () => {
    const templates = await requestJson<GuaranteeTemplate[]>(
        `${bootEnv.REGISTRY_SERVICE_URL}/api/v1/guaranteeTemplates`,
        {
            headers: serviceHeaders(),
        },
    );
    return templates.filter((template) => pocGuarantees.has(template.name));
};
