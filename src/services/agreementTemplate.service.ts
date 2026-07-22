import { AGREEMENT_TEMPLATES, GUARANTEE_TEMPLATES } from '../data/agreementTemplates.js';
import { ONBOARDING_DEFINITIONS } from '../data/onboardingDefinitions.js';
import type { JoinTemplateOption } from '../types/onboarding.js';
import { NotFoundError } from '../utils/customErrors.js';

const clone = <T>(value: T): T => structuredClone(value);
const guaranteeNames = new Set(GUARANTEE_TEMPLATES.map((template) => template.name));

const options: JoinTemplateOption[] = AGREEMENT_TEMPLATES.map((agreementTemplate) => {
    const onboardingDefinition = ONBOARDING_DEFINITIONS.find(
        (definition) => definition.agreementTemplateId === agreementTemplate._id,
    );
    if (!onboardingDefinition)
        throw new Error(
            `Agreement template '${agreementTemplate.name}' has no onboarding definition`,
        );

    const templateGuarantees = new Set(
        agreementTemplate.guarantees.map((guarantee) => guarantee.guaranteeTemplateName),
    );
    for (const guarantee of templateGuarantees) {
        if (!guaranteeNames.has(guarantee))
            throw new Error(
                `Agreement template '${agreementTemplate.name}' references unknown guarantee '${guarantee}'`,
            );
    }
    for (const signature of onboardingDefinition.mappings.signatures) {
        if (!templateGuarantees.has(signature.guaranteeTemplateName))
            throw new Error(
                `Onboarding '${onboardingDefinition.id}' maps guarantee '${signature.guaranteeTemplateName}' which is not in its agreement template`,
            );
    }
    const mappedGuarantees = new Set(
        onboardingDefinition.mappings.signatures.map(
            ({ guaranteeTemplateName }) => guaranteeTemplateName,
        ),
    );
    for (const guarantee of templateGuarantees) {
        if (!mappedGuarantees.has(guarantee))
            throw new Error(
                `Agreement template '${agreementTemplate.name}' has no signature mapping for '${guarantee}'`,
            );
    }
    const requirementIds = new Set(onboardingDefinition.requirements.map(({ id }) => id));
    if (requirementIds.size !== onboardingDefinition.requirements.length)
        throw new Error(`Onboarding '${onboardingDefinition.id}' has duplicate requirement IDs`);
    const mappedAnswers = JSON.stringify(onboardingDefinition.mappings);
    for (const requirement of onboardingDefinition.requirements) {
        for (const dependency of requirement.dependsOn || []) {
            if (!requirementIds.has(dependency))
                throw new Error(
                    `Requirement '${requirement.id}' depends on missing requirement '${dependency}'`,
                );
        }
        if (
            !mappedAnswers.includes(`"answer":"${requirement.id}"`) &&
            requirement.requiredBy.length
        )
            throw new Error(`Requirement '${requirement.id}' is not used by an onboarding mapping`);
    }
    return { agreementTemplate, onboardingDefinition };
});

export const listPublic = async () => clone(options);

export const getPublic = async (id: string) => {
    const option = options.find((candidate) => candidate.agreementTemplate._id === id);
    if (!option) throw new NotFoundError('Public agreement template not found');
    return clone(option);
};

export const listGuaranteeTemplates = async () => clone(GUARANTEE_TEMPLATES);
